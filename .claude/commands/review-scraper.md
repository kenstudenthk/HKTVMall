Review the data scraping code in this project.

Read the following files:
- `src/config.py` — API URLs, category codes, scraper settings
- `src/streaming_processor.py` — main scraper: fetch_and_process_page, scrape_and_process_category, run_streaming_processor
- `src/scraper.py` — entry point

Then review for the following:
1. **API correctness** — Are request params (query, currentPage, pageSize) built correctly? Is the `_normalize_product` price extraction (priceList → BUY/DISCOUNT entries) correct?
2. **Pagination** — Does the loop correctly bound pages using `numberOfPages`? Does the early-stop sentinel (`None` return from `fetch_and_process_page`) work correctly?
3. **Product filtering** — Does `process_product` correctly filter out items with no discount (sale_price >= original_price) and zero/missing prices?
4. **Field extraction** — Are `product_code`, `product_name`, `brand`, `image_url`, `product_url`, `in_stock`, `category` extracted correctly from the raw API response?
5. **Error handling** — Are request failures and non-200 responses handled gracefully without crashing the pipeline?
6. **Memory efficiency** — Is per-page streaming processing maintained (no full dataset held in memory at once)?

Report all bugs, inconsistencies, or improvements found. For each issue state: file, line number, description, and suggested fix.
