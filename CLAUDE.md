# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HKTVmall Pet Food Deal Finder - An automated web scraping pipeline that finds the best pet food deals from HKTVmall (Hong Kong TV Mall). The system scrapes product data, processes it to identify deals, and displays results via a static frontend.

**Tech Stack:**
- Backend: Python 3.12 + Playwright
- Frontend: Vanilla JavaScript, HTML5, CSS3
- Automation: GitHub Actions (weekly schedule)
- Data Storage: JSON files (raw_products.json via Git LFS, deals.json)

## Architecture

The data flows through three stages:

1. **Scraper** (`src/scraper.py`): Uses Playwright to call HKTVmall's internal `cate-search.hktvmall.com/query/products` API for cat and dog food categories → outputs `data/raw_products.json`

2. **Processor** (`src/processor.py`): Calculates discount percentages, filters for actual deals → outputs `data/deals.json`

3. **Frontend** (`site/`): Static SPA reads `site/data/deals.json` and displays filtered/sorted deals

**Important:** All configuration (API endpoints, category codes, scraping limits) is centralized in `src/config.py`.

## Development Commands

### Setup
```bash
# Install Python dependencies
pip install -r requirements.txt

# Install Playwright browser (required for scraper)
python -m playwright install chromium --with-deps
```

### Running the Pipeline
```bash
# 1. Scrape fresh data from HKTVmall
python -m src.scraper

# 2. Process raw data into deals
python -m src.processor

# 3. Copy processed data to site directory
./build.sh

# 4. Serve the frontend locally
http-server site/  # or any static file server
```

### Email Digest
```bash
# Requires environment variables: EMAIL_SENDER, EMAIL_PASSWORD, EMAIL_RECIPIENT
export EMAIL_SENDER="your-email@gmail.com"
export EMAIL_PASSWORD="your-app-password"
export EMAIL_RECIPIENT="recipient@example.com"
python -m src.emailer
```

## GitHub Actions Workflow

The repository uses automated weekly scraping via `.github/workflows/weekly_scrape.yml`:
- **Schedule:** Sundays at 2AM UTC (10AM HKT)
- **Sequence:** scraper → processor → emailer → commit & push updated data
- **Secrets required:** `EMAIL_SENDER`, `EMAIL_PASSWORD`, `EMAIL_RECIPIENT` (set in repo settings)

### Viewing Logs and Errors

To check workflow execution status and troubleshoot errors:
1. Go to the **Actions** tab on GitHub: `https://github.com/{owner}/HKTVMall/actions`
2. Click on the specific workflow run to view detailed logs
3. Each step (scraper, processor, emailer, commit) has expandable logs
4. Failed steps will be highlighted in red with error details

You can also manually trigger the workflow:
1. Navigate to Actions tab → "Weekly Pet Food Deal Scrape"
2. Click "Run workflow" button → select branch → Run

## Key Files

- `src/config.py` - All configuration constants (API URLs, categories, limits, paths)
- `src/scraper.py` - Playwright-based API scraper with pagination
- `src/processor.py` - Deal filtering and discount calculation logic
- `src/emailer.py` - SMTP email digest sender
- `site/js/app.js` - All frontend logic (filtering, sorting, pagination, manual refresh)
- `.gitattributes` - Git LFS tracking for `data/raw_products.json` (large file)

## Data Files

- `data/raw_products.json` - Raw scraped products (tracked with Git LFS)
- `data/deals.json` - Filtered deals with discount calculations
- `site/data/deals.json` - Copy of deals.json for frontend (created by `build.sh`)

## Important Notes

- The scraper calls HKTVmall's internal API directly (not browser automation)
- `raw_products.json` uses Git LFS due to size - ensure LFS is installed when cloning
- The processor normalizes price data from the API's `priceList` structure (BUY + DISCOUNT entries)
- Frontend includes a manual "Update Data" button that re-runs the scraping pipeline client-side
