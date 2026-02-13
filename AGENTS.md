# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

HKTVmall Pet Food Discount Finder - A scraping pipeline that fetches pet food deals from HKTVmall, processes discount data, and serves it via a static web dashboard. Includes email digest functionality for weekly deal notifications.

## Commands

### Setup
```bash
pip install -r requirements.txt
python -m playwright install chromium --with-deps
```

### Run Pipeline
```bash
# Scrape products from HKTVmall cate-search API
python -m src.scraper

# Process raw data into deals (requires scraper to run first)
python -m src.processor

# Send email digest (requires EMAIL_SENDER, EMAIL_PASSWORD, EMAIL_RECIPIENT env vars)
python -m src.emailer
```

### Build Static Site
```bash
./build.sh  # Copies data/deals.json to site/data/ for Cloudflare Pages
```

## Architecture

### Data Pipeline
```
src/scraper.py → data/raw_products.json → src/processor.py → data/deals.json → site/data/deals.json
```

1. **Scraper** (`src/scraper.py`): Uses Playwright's request API (not browser automation) to call `cate-search.hktvmall.com/query/products` directly. Paginates through dog food and cat food categories.

2. **Processor** (`src/processor.py`): Filters products with active discounts, calculates discount percentages, deduplicates by product code, and sorts by discount descending.

3. **Emailer** (`src/emailer.py`): Generates HTML email with top 20 deals per category, sends via Gmail SMTP.

### Static Dashboard
- `site/index.html` + `site/js/app.js` + `site/css/style.css`
- Client-side filtering/sorting with vanilla JavaScript
- Fetches `data/deals.json` at runtime
- Deployed to Cloudflare Pages

### Configuration
All settings are in `src/config.py`:
- API endpoints and category codes
- Scraper rate limits (`REQUEST_DELAY`, `PAGE_SIZE`, `MAX_PAGES`)
- Email settings (via environment variables)

## CI/CD

GitHub Actions workflow (`.github/workflows/weekly_scrape.yml`) runs every Sunday at 2AM UTC:
1. Runs full pipeline (scrape → process → email)
2. Commits updated `data/*.json` files back to repo

## Key Implementation Details

- The scraper uses `_normalize_product()` to convert the API's `priceList` format (with `DISCOUNT` entries) into the `promotionPrice` field expected by the processor
- Category codes: `AA83100510000` (dog food), `AA83200510000` (cat food)
- Products without both original and promotion prices are filtered out
