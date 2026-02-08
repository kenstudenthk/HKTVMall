"""
Playwright-based scraper that intercepts HKTVmall AJAX responses.

Navigates to category pages in a real browser and captures the JSON
responses from the internal /ajax/search_products endpoint.

Usage:
    python -m src.scraper
"""

import asyncio
import json
import logging
import time

from playwright.async_api import async_playwright, Response
from playwright_stealth import stealth_async

from src.config import (
    CATEGORIES,
    DATA_DIR,
    MAX_PAGES,
    NAVIGATION_TIMEOUT,
    RAW_PRODUCTS_PATH,
    REQUEST_DELAY,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)


async def _capture_ajax_response(response: Response) -> dict | None:
    """Return parsed JSON if this response is a search_products AJAX call."""
    if "search_products" not in response.url:
        return None
    if response.status != 200:
        log.warning("AJAX response status %d for %s", response.status, response.url)
        return None
    try:
        return await response.json()
    except Exception:
        log.warning("Failed to parse AJAX JSON from %s", response.url)
        return None


async def scrape_category(page, category_key: str, category_info: dict) -> list[dict]:
    """Scrape all products for a single category via AJAX interception."""
    label = category_info["label"]
    search_url = category_info["search_url"]
    all_products: list[dict] = []
    captured: dict | None = None

    async def on_response(resp: Response):
        nonlocal captured
        data = await _capture_ajax_response(resp)
        if data is not None:
            captured = data

    page.on("response", on_response)

    # --- Page 0 (first load) ---
    log.info("[%s] Loading first page: %s", label, search_url)
    captured = None
    await page.goto(search_url, wait_until="networkidle", timeout=NAVIGATION_TIMEOUT)

    # Wait a bit for any late AJAX calls
    await page.wait_for_timeout(3000)

    if captured is None:
        log.error("[%s] No AJAX response captured on first page. Aborting category.", label)
        page.remove_listener("response", on_response)
        return all_products

    # Extract pagination info
    pagination = captured.get("pagination", {})
    total_pages = pagination.get("numberOfPages", 1)
    total_results = pagination.get("totalNumberOfResults", 0)
    log.info(
        "[%s] Found %d total results across %d pages",
        label, total_results, total_pages,
    )

    # Collect products from first page
    products = captured.get("products", [])
    for p in products:
        p["_category"] = category_key
    all_products.extend(products)
    log.info("[%s] Page 0: captured %d products", label, len(products))

    # --- Remaining pages ---
    pages_to_scrape = min(total_pages, MAX_PAGES)
    for page_num in range(1, pages_to_scrape):
        await asyncio.sleep(REQUEST_DELAY)

        page_url = f"{search_url}&currentPage={page_num}"
        log.info("[%s] Loading page %d/%d", label, page_num, pages_to_scrape - 1)

        captured = None
        try:
            await page.goto(page_url, wait_until="networkidle", timeout=NAVIGATION_TIMEOUT)
            await page.wait_for_timeout(2000)
        except Exception as e:
            log.warning("[%s] Navigation error on page %d: %s", label, page_num, e)
            continue

        if captured is None:
            log.warning("[%s] No AJAX response on page %d, skipping", label, page_num)
            continue

        products = captured.get("products", [])
        for p in products:
            p["_category"] = category_key
        all_products.extend(products)
        log.info("[%s] Page %d: captured %d products (total: %d)", label, page_num, len(products), len(all_products))

    page.remove_listener("response", on_response)
    return all_products


async def run_scraper():
    """Main scraper entry point."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    all_products: list[dict] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            locale="en-HK",
        )
        page = await context.new_page()
        await stealth_async(page)

        for cat_key, cat_info in CATEGORIES.items():
            try:
                products = await scrape_category(page, cat_key, cat_info)
                all_products.extend(products)
            except Exception as e:
                log.error("Failed to scrape %s: %s", cat_key, e, exc_info=True)

        await browser.close()

    log.info("Total raw products captured: %d", len(all_products))

    # Save raw data
    RAW_PRODUCTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(RAW_PRODUCTS_PATH, "w", encoding="utf-8") as f:
        json.dump(all_products, f, ensure_ascii=False, indent=2)

    log.info("Raw products saved to %s", RAW_PRODUCTS_PATH)
    return all_products


def main():
    asyncio.run(run_scraper())


if __name__ == "__main__":
    main()
