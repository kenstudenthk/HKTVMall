"""
Streaming processor: fetch → process → deduplicate → write.

Processes products page-by-page to minimize memory usage.
Deduplicates globally across all categories.
Writes atomically to deals.json.

Usage:
    python -m src.streaming_processor
"""

import asyncio
import json
import logging
import os
import shutil
import tempfile
from datetime import date
from pathlib import Path

from playwright.async_api import async_playwright

from src.config import (
    API_TIMEOUT,
    BASE_URL,
    CATE_SEARCH_API_URL,
    CATEGORIES,
    DATA_DIR,
    DEALS_PATH,
    MAX_PAGES,
    PAGE_SIZE,
    REQUEST_DELAY,
)

try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:
    boto3 = None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)


def _safe_float(obj: dict | None, key: str = "value") -> float | None:
    """Safely extract a float from a nested price dict."""
    if obj is None:
        return None
    val = obj.get(key)
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _normalize_product(product: dict) -> dict:
    """Add promotionPrice from priceList for processor compatibility.

    The cate-search API returns prices in priceList (BUY + DISCOUNT entries)
    rather than separate price/promotionPrice fields.
    """
    price_list = product.get("priceList", [])
    for entry in price_list:
        if entry.get("priceType") == "DISCOUNT":
            product["promotionPrice"] = {
                "currencyIso": entry.get("currencyIso", "HKD"),
                "value": entry.get("value"),
                "formattedValue": entry.get("formattedValue", ""),
            }
            break
    return product


def process_product(raw: dict, scraped_date: str) -> dict | None:
    """Convert a raw AJAX product dict into a deal record.

    Returns None if the product has no discount or is missing required fields.
    """
    original_price = _safe_float(raw.get("price"))
    sale_price = _safe_float(raw.get("promotionPrice"))

    if original_price is None or sale_price is None:
        return None
    if original_price <= 0 or sale_price <= 0:
        return None
    if sale_price >= original_price:
        return None  # No discount

    discount_pct = round((original_price - sale_price) / original_price * 100, 2)

    # Build image URL
    images = raw.get("images", [])
    image_url = ""
    if images:
        img = images[0].get("url", "")
        if img.startswith("//"):
            img = "https:" + img
        image_url = img

    # Build product URL
    product_url = raw.get("url", "")
    if product_url and not product_url.startswith("http"):
        product_url = BASE_URL + product_url

    # Stock status
    stock_info = raw.get("stock", {})
    stock_status = stock_info.get("stockLevelStatus", {})
    in_stock = stock_status.get("code", "") == "inStock"

    return {
        "product_code": raw.get("code", ""),
        "product_name": raw.get("name", ""),
        "brand": raw.get("brandName", ""),
        "original_price": original_price,
        "sale_price": sale_price,
        "discount_pct": discount_pct,
        "category": raw.get("_category", "unknown"),
        "image_url": image_url,
        "product_url": product_url,
        "in_stock": in_stock,
        "scraped_date": scraped_date,
    }


def atomic_write_json(path: Path, data: list[dict]):
    """Write JSON atomically using temp file + rename."""
    # Ensure parent directory exists
    path.parent.mkdir(parents=True, exist_ok=True)

    # Create temp file in same directory (same filesystem for atomic rename)
    temp_fd, temp_path = tempfile.mkstemp(
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp"
    )

    try:
        # Write JSON to temp file
        with os.fdopen(temp_fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        # Atomic rename (works on both POSIX and Windows)
        shutil.move(temp_path, path)
        log.info(f"Atomically wrote {len(data)} deals to {path}")

    except Exception as e:
        # Clean up temp file on error
        Path(temp_path).unlink(missing_ok=True)
        log.error(f"Failed to write {path}: {e}")
        raise


def load_previous_deals() -> dict[str, dict]:
    """Load existing deals.json and return a lookup dict by product_code."""
    if not DEALS_PATH.exists():
        log.info("No previous deals.json found, all items will be marked as new")
        return {}

    try:
        with open(DEALS_PATH, "r", encoding="utf-8") as f:
            previous = json.load(f)
        lookup = {d["product_code"]: d for d in previous if d.get("product_code")}
        log.info(f"Loaded {len(lookup)} previous deals for last_updated comparison")
        return lookup
    except (json.JSONDecodeError, KeyError) as e:
        log.warning(f"Failed to load previous deals.json: {e}")
        return {}


def apply_last_updated(
    deals: list[dict],
    previous_lookup: dict[str, dict],
    scraped_date: str,
) -> list[dict]:
    """Set last_updated on each deal by comparing with previous data."""
    for deal in deals:
        code = deal["product_code"]
        prev = previous_lookup.get(code)

        if prev is None:
            # New item
            deal["last_updated"] = scraped_date
        elif (
            deal["original_price"] != prev.get("original_price")
            or deal["sale_price"] != prev.get("sale_price")
            or deal["in_stock"] != prev.get("in_stock")
        ):
            # Data changed
            deal["last_updated"] = scraped_date
        else:
            # Unchanged — carry over previous last_updated
            deal["last_updated"] = prev.get("last_updated", prev.get("scraped_date", scraped_date))

    return deals


def upload_to_r2(deals: list[dict]):
    """Upload deals.json to Cloudflare R2 via boto3. Skips silently if not configured."""
    if boto3 is None:
        log.debug("boto3 not installed, skipping R2 upload")
        return

    access_key = os.environ.get("R2_ACCESS_KEY_ID")
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
    endpoint = os.environ.get("R2_ENDPOINT")
    bucket = os.environ.get("R2_BUCKET")

    if not all([access_key, secret_key, endpoint, bucket]):
        log.debug("R2 credentials not configured, skipping upload")
        return

    try:
        s3 = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )
        body = json.dumps(deals, ensure_ascii=False, indent=2).encode("utf-8")
        s3.put_object(
            Bucket=bucket,
            Key="deals.json",
            Body=body,
            ContentType="application/json",
        )
        log.info(f"Uploaded {len(deals)} deals to R2 ({len(body)} bytes)")
    except Exception as e:
        log.warning(f"R2 upload failed (non-fatal): {e}")


async def fetch_and_process_page(
    api_context,
    category_key: str,
    query: str,
    page_num: int,
    scraped_date: str,
    label: str
) -> list[dict]:
    """Fetch one page and process products immediately.

    Returns list of deals (filtered products with discounts).
    """
    try:
        resp = await api_context.post(
            CATE_SEARCH_API_URL,
            params={
                "query": query,
                "currentPage": str(page_num),
                "pageSize": str(PAGE_SIZE),
            },
            timeout=API_TIMEOUT,
        )
    except Exception as e:
        log.warning("[%s] API request failed on page %d: %s", label, page_num, e)
        return []

    if resp.status != 200:
        log.warning("[%s] API returned status %d on page %d", label, resp.status, page_num)
        return []

    data = await resp.json()
    products = data.get("products", [])

    if not products:
        return []

    # Process each product immediately
    deals = []
    for product in products:
        _normalize_product(product)
        product["_category"] = category_key

        deal = process_product(product, scraped_date)
        if deal:  # Only keep products with discounts
            deals.append(deal)

    return deals


async def scrape_and_process_category(
    api_context,
    category_key: str,
    category_info: dict,
    scraped_date: str
) -> list[dict]:
    """Scrape all pages for a category, processing each page immediately.

    Returns list of all deals for this category.
    """
    label = category_info["label"]
    query = category_info["query"]
    category_deals = []

    # --- Page 0: Get total pages and first batch ---
    log.info("[%s] Fetching page 0...", label)
    try:
        resp = await api_context.post(
            CATE_SEARCH_API_URL,
            params={"query": query, "currentPage": "0", "pageSize": str(PAGE_SIZE)},
            timeout=API_TIMEOUT,
        )
    except Exception as e:
        log.error("[%s] API request failed on page 0: %s", label, e)
        return category_deals

    if resp.status != 200:
        log.error("[%s] API returned status %d on page 0", label, resp.status)
        return category_deals

    data = await resp.json()
    pagination = data.get("pagination", {})
    total_pages = pagination.get("numberOfPages", 1)
    total_results = pagination.get("totalNumberOfResults", 0)
    log.info("[%s] Found %d total results across %d pages", label, total_results, total_pages)

    # Process page 0 products
    products = data.get("products", [])
    for product in products:
        _normalize_product(product)
        product["_category"] = category_key
        deal = process_product(product, scraped_date)
        if deal:
            category_deals.append(deal)

    log.info("[%s] Page 0: processed %d deals from %d products", label, len(category_deals), len(products))

    # --- Remaining pages ---
    pages_to_scrape = min(total_pages, MAX_PAGES)
    for page_num in range(1, pages_to_scrape):
        await asyncio.sleep(REQUEST_DELAY)

        log.info("[%s] Fetching page %d/%d...", label, page_num, pages_to_scrape - 1)

        page_deals = await fetch_and_process_page(
            api_context, category_key, query, page_num, scraped_date, label
        )

        if not page_deals and not products:
            # No deals and no products means truly empty page
            log.info("[%s] No more products at page %d, stopping", label, page_num)
            break

        category_deals.extend(page_deals)
        log.info(
            "[%s] Page %d: processed %d deals (total: %d)",
            label, page_num, len(page_deals), len(category_deals)
        )

    return category_deals


def deduplicate_and_sort(deals: list[dict]) -> list[dict]:
    """Global deduplication by product_code, sort by discount."""
    seen_codes = set()
    deduplicated = []

    for deal in deals:
        code = deal["product_code"]
        if code and code in seen_codes:
            continue
        if code:
            seen_codes.add(code)
        deduplicated.append(deal)

    deduplicated.sort(key=lambda d: d["discount_pct"], reverse=True)

    log.info(f"Deduplicated {len(deals)} → {len(deduplicated)} unique deals")
    return deduplicated


async def run_streaming_processor():
    """Main entry point: scrape → process → deduplicate → write."""
    # Capture scraped date once at start for consistency
    scraped_date = date.today().isoformat()
    log.info(f"Starting streaming processor (scraped_date: {scraped_date})")

    # Load previous deals for last_updated comparison
    previous_lookup = load_previous_deals()

    all_deals = []
    failed_categories = []

    async with async_playwright() as pw:
        api_context = await pw.request.new_context(
            extra_http_headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                "Accept": "application/json, text/plain, */*",
                "Origin": "https://www.hktvmall.com",
                "Referer": "https://www.hktvmall.com/",
            }
        )

        for cat_key, cat_info in CATEGORIES.items():
            try:
                deals = await scrape_and_process_category(
                    api_context, cat_key, cat_info, scraped_date
                )
                all_deals.extend(deals)
                log.info(f"[{cat_info['label']}] Completed: {len(deals)} deals")

                # Incremental: deduplicate, apply last_updated, write & upload
                intermediate = deduplicate_and_sort(list(all_deals))
                apply_last_updated(intermediate, previous_lookup, scraped_date)
                atomic_write_json(DEALS_PATH, intermediate)
                upload_to_r2(intermediate)
            except Exception as e:
                log.error(f"[{cat_info['label']}] Failed: {e}", exc_info=True)
                failed_categories.append(cat_key)

        await api_context.dispose()

    if not all_deals:
        log.error("No deals collected from any category")
        return []

    # Final deduplication, last_updated, and write
    final_deals = deduplicate_and_sort(all_deals)
    apply_last_updated(final_deals, previous_lookup, scraped_date)
    log.info(f"Total unique deals: {len(final_deals)}")

    atomic_write_json(DEALS_PATH, final_deals)
    upload_to_r2(final_deals)

    if failed_categories:
        log.warning(f"Partial success. Failed categories: {failed_categories}")

    return final_deals


def main():
    """CLI entry point."""
    asyncio.run(run_streaming_processor())


if __name__ == "__main__":
    main()
