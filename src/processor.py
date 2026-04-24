"""
Process raw scraped products into filtered, deduplicated deals.

Calculates discount percentages, filters products with active discounts,
and saves the result to data/deals.json.

Usage:
    python -m src.processor
"""

import json
import logging
import re
from datetime import date

from src.config import BASE_URL, DEALS_PATH, RAW_PRODUCTS_PATH

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


def _extract_weight(product_name: str) -> float | None:
    """Extract weight from product name and return in grams.

    Supports: kg, lb, oz, g (case-insensitive).
    Returns None if no weight found.
    """
    if not product_name:
        return None

    # Try kg first (e.g., "1.18千克", "2.7kg", "6lb/2.7kg")
    match = re.search(r'([\d.]+)\s*(?:kg|千克)', product_name, re.IGNORECASE)
    if match:
        return float(match.group(1)) * 1000  # convert to grams

    # Try lb (e.g., "4 lb", "6lb", "4lb")
    match = re.search(r'([\d.]+)\s*(?:lb|磅)', product_name, re.IGNORECASE)
    if match:
        return float(match.group(1)) * 453.592  # convert to grams

    # Try oz (e.g., "4.5oz", "12 oz")
    match = re.search(r'([\d.]+)\s*(?:oz|安士)', product_name, re.IGNORECASE)
    if match:
        return float(match.group(1)) * 28.3495  # convert to grams

    # Try g standalone (e.g., "85g", "300 g")
    match = re.search(r'([\d.]+)\s*(?:g|克)(?!\w)', product_name, re.IGNORECASE)
    if match:
        return float(match.group(1))

    return None


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
        "weight_grams": _extract_weight(raw.get("name", "")),
    }


def run_processor():
    """Load raw products, process into deals, save to deals.json."""
    if not RAW_PRODUCTS_PATH.exists():
        log.error("Raw products file not found: %s", RAW_PRODUCTS_PATH)
        log.error("Run the scraper first: python -m src.scraper")
        return []

    with open(RAW_PRODUCTS_PATH, "r", encoding="utf-8") as f:
        raw_products = json.load(f)

    log.info("Loaded %d raw products", len(raw_products))

    scraped_date = date.today().isoformat()
    deals: list[dict] = []
    seen_codes: set[str] = set()

    for raw in raw_products:
        deal = process_product(raw, scraped_date)
        if deal is None:
            continue
        code = deal["product_code"]
        if code and code in seen_codes:
            continue
        if code:
            seen_codes.add(code)
        deals.append(deal)

    # Sort by discount descending
    deals.sort(key=lambda d: d["discount_pct"], reverse=True)

    log.info("Processed %d deals with discounts", len(deals))

    DEALS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(DEALS_PATH, "w", encoding="utf-8") as f:
        json.dump(deals, f, ensure_ascii=False, indent=2)

    log.info("Deals saved to %s", DEALS_PATH)
    return deals


def main():
    run_processor()


if __name__ == "__main__":
    main()
