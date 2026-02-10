"""
Scraper that fetches HKTVmall product data via the cate-search API.

Calls the cate-search.hktvmall.com/query/products endpoint directly
using Playwright's request API, paginating through all results.

Usage:
    python -m src.scraper
"""

import asyncio
import json
import logging

from playwright.async_api import async_playwright

from src.config import (
    API_TIMEOUT,
    CATE_SEARCH_API_URL,
    CATEGORIES,
    DATA_DIR,
    MAX_PAGES,
    PAGE_SIZE,
    RAW_PRODUCTS_PATH,
    REQUEST_DELAY,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)


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


async def scrape_category(api_context, category_key: str, category_info: dict) -> list[dict]:
    """Scrape all products for a single category via direct API calls."""
    label = category_info["label"]
    query = category_info["query"]
    all_products: list[dict] = []

    # --- Page 0 ---
    log.info("[%s] Fetching page 0...", label)
    try:
        resp = await api_context.post(
            CATE_SEARCH_API_URL,
            params={"query": query, "currentPage": "0", "pageSize": str(PAGE_SIZE)},
            timeout=API_TIMEOUT,
        )
    except Exception as e:
        log.error("[%s] API request failed on page 0: %s", label, e)
        return all_products

    if resp.status != 200:
        log.error("[%s] API returned status %d on page 0", label, resp.status)
        return all_products

    data = await resp.json()
    pagination = data.get("pagination", {})
    total_pages = pagination.get("numberOfPages", 1)
    total_results = pagination.get("totalNumberOfResults", 0)
    log.info("[%s] Found %d total results across %d pages", label, total_results, total_pages)

    products = data.get("products", [])
    for p in products:
        _normalize_product(p)
        p["_category"] = category_key
    all_products.extend(products)
    log.info("[%s] Page 0: fetched %d products", label, len(products))

    # --- Remaining pages ---
    pages_to_scrape = min(total_pages, MAX_PAGES)
    for page_num in range(1, pages_to_scrape):
        await asyncio.sleep(REQUEST_DELAY)

        log.info("[%s] Fetching page %d/%d...", label, page_num, pages_to_scrape - 1)
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
            continue

        if resp.status != 200:
            log.warning("[%s] API returned status %d on page %d", label, resp.status, page_num)
            continue

        data = await resp.json()
        products = data.get("products", [])
        if not products:
            log.info("[%s] No more products at page %d, stopping", label, page_num)
            break

        for p in products:
            _normalize_product(p)
            p["_category"] = category_key
        all_products.extend(products)
        log.info("[%s] Page %d: fetched %d products (total: %d)", label, page_num, len(products), len(all_products))

    return all_products


async def run_scraper():
    """Main scraper entry point."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    all_products: list[dict] = []

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
                products = await scrape_category(api_context, cat_key, cat_info)
                all_products.extend(products)
            except Exception as e:
                log.error("Failed to scrape %s: %s", cat_key, e, exc_info=True)

        await api_context.dispose()

    log.info("Total raw products captured: %d", len(all_products))

    # Save raw data
    RAW_PRODUCTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(RAW_PRODUCTS_PATH, "w", encoding="utf-8") as f:
        json.dump(all_products, f, ensure_ascii=False, indent=2)

    log.info("Raw products saved to %s", RAW_PRODUCTS_PATH)
    return all_products


def main():
    """Run the scraper using streaming processor for memory efficiency."""
    from src.streaming_processor import run_streaming_processor

    log.info("Using streaming processor for batch-by-batch processing")
    asyncio.run(run_streaming_processor())


if __name__ == "__main__":
    main()
