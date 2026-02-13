# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HKTVmall Pet Food Deal Finder - An automated web scraping pipeline that finds the best pet food deals from HKTVmall (Hong Kong TV Mall). The system scrapes product data, processes it to identify deals, and displays results via a static frontend deployed on Cloudflare Pages.

**Tech Stack:**
- Backend: Python 3.12 + Playwright (async API calls, not browser automation)
- Frontend: Vanilla JavaScript (ES6 module), HTML5, CSS3 — no build tooling
- Hosting: Cloudflare Pages (static site + Pages Functions)
- Automation: GitHub Actions (weekly schedule + manual dispatch)
- Data Storage: JSON files (`raw_products.json` via Git LFS, `deals.json`), Cloudflare R2 for fast delivery

## Architecture

### Data Pipeline

```
HKTVmall API → streaming_processor.py → [per category: deduplicate → write deals.json → R2 upload]
                                       → final deals.json → R2 upload (fast) → /api/deals → Browser
                                                          → git commit → build.sh → site/data/deals.json (fallback)
```

1. **Streaming Processor** (`src/streaming_processor.py`) — the main workhorse:
   - Calls HKTVmall's internal `cate-search.hktvmall.com/query/products` API via Playwright request context
   - Processes each page (60 products) immediately after fetching — no full dataset in memory
   - Filters for products with active discounts, calculates discount percentages
   - Global deduplication by `product_code` across all categories, sorts by discount% descending
   - **Per-item `last_updated`**: compares each deal against previous `deals.json` — only updates the date when `original_price`, `sale_price`, or `in_stock` changes; carries over previous date for unchanged items
   - **Incremental R2 uploads**: after each category completes, deduplicates/writes/uploads intermediate results so the frontend sees partial data sooner
   - Atomic writes to `data/deals.json` (temp file + rename)
   - R2 upload via `boto3` (skips silently if credentials not configured)
   - Peak memory: ~48MB (vs 337MB legacy approach)

2. **Scraper** (`src/scraper.py`) — entry point that delegates to `streaming_processor.run_streaming_processor()`

3. **Processor** (`src/processor.py`) — legacy batch processor, kept for manual debugging only (removed from CI workflow — was overwriting fresh streaming data with stale `raw_products.json`)

4. **Frontend** (`site/`) — SPA that fetches `data/deals.json` and renders a filterable dashboard

5. **Trigger Function** (`functions/api/trigger-scraper.js`) — Cloudflare Pages Function that triggers GitHub Actions via workflow_dispatch

### Frontend Architecture (`site/js/app.js`)

ES6 module handling:
- **State object** with allDeals, filteredDeals, currentPage, filters, updateStatus
- **Filtering**: discount%, category, brand, price range, stock status
- **Sorting**: discount desc, price asc/desc, name A-Z
- **Pagination**: 30 products/page
- **Per-item `last_updated` display**: each card shows relative date ("Updated today", "Updated yesterday", "Updated Feb 10") via `formatLastUpdated()`
- **Manual update trigger** → polls for new data with exponential backoff (2min→3min→5min, 40min timeout)
- **Polling detects** both `scraped_date` changes and deal count changes (catches incremental R2 uploads)
- **localStorage persistence** for polling state across page refreshes
- **Toast notifications** and **status banner** with countdown timer

All user-facing text is sanitized via `escapeHTML()` to prevent XSS.

## Development Commands

### Setup
```bash
pip install -r requirements.txt
python -m playwright install chromium --with-deps
```

### Run Pipeline
```bash
# Scrape + process (streaming, memory-efficient)
python -m src.scraper

# Copy deals to site directory
./build.sh

# Serve locally
http-server site/    # or any static file server on port 8080
```

### Legacy (manual debugging only)
```bash
python -m src.processor    # Batch-processes data/raw_products.json → data/deals.json
```

### Email Digest (currently disabled in CI)
```bash
export EMAIL_SENDER="your-email@gmail.com"
export EMAIL_PASSWORD="your-app-password"
export EMAIL_RECIPIENT="recipient@example.com"
python -m src.emailer
```

## Configuration

All backend settings centralized in `src/config.py`:
- **API**: `CATE_SEARCH_API_URL`, `PAGE_SIZE=60`, `MAX_PAGES=250`, `REQUEST_DELAY=1.0s`, `API_TIMEOUT=30000ms`
- **Categories**: Dog food (`AA83100510000`), Cat food (`AA83200510000`)
- **Paths**: `DATA_DIR`, `RAW_PRODUCTS_PATH`, `DEALS_PATH`
- **Email**: SMTP via Gmail (credentials from env vars)

**R2 upload** (env vars, optional — skips silently if missing): `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET`

Frontend config is inline in `app.js` (`PRODUCTS_PER_PAGE=30`, polling intervals).

## GitHub Actions Workflow

`.github/workflows/weekly_scrape.yml`:
- **Schedule**: Sundays 2AM UTC (10AM HKT) + manual `workflow_dispatch`
- **Steps**: checkout → Python 3.12 → install deps → install Playwright → scraper (with R2 env vars for incremental uploads) → R2 upload (safety net) → commit & push
- **R2 upload**: Scraper uploads incrementally via boto3 after each category; AWS CLI step remains as final safety net (skips gracefully if secrets not configured)
- **Note**: Legacy `processor.py` step was removed — it was overwriting fresh streaming data with stale `raw_products.json`
- **Permissions**: `contents: write`
- **Timeout**: 60 minutes
- Email digest step is commented out

## Cloudflare Pages

- Static site served from `site/` directory
- `build.sh` is the build command (copies `data/deals.json` → `site/data/`)
- **R2 bucket**: `hktv` — stores `deals.json` for fast serving via Pages Function
- Pages Function at `functions/api/deals.js` serves deals.json from R2 (`DEALS_BUCKET` binding)
- Pages Function at `functions/api/trigger-scraper.js` triggers GitHub Actions
- Frontend fetches `/api/deals` first (R2), falls back to static `data/deals.json`
- **Required env vars** (set in Cloudflare Pages dashboard): `GITHUB_TOKEN` (PAT with `workflow` scope), `GITHUB_OWNER`, `GITHUB_REPO`
- See `CLOUDFLARE_SETUP.md` for detailed setup instructions

## Key Implementation Details

- The scraper uses `_normalize_product()` to convert the API's `priceList` format (BUY + DISCOUNT entries) into the `promotionPrice` field
- Products without both original and promotion prices are filtered out
- `scraped_date` is captured once at run start for consistency across all records
- Each deal has a `last_updated` field (YYYY-MM-DD) — only changes when `original_price`, `sale_price`, or `in_stock` differs from previous run; otherwise carries over previous value
- `raw_products.json` (~312MB) is tracked with Git LFS — ensure LFS is installed when cloning
- No test framework — verification is manual (check `deals.json` output, browser DevTools, GitHub Actions logs)
- Repository owner: `kenstudenthk`, repo name: `HKTVMall`

## Key Files

- `src/config.py` — all configuration constants
- `src/streaming_processor.py` — main processor (fetch + process + deduplicate + per-item last_updated + atomic write + incremental R2 upload)
- `src/scraper.py` — entry point, delegates to streaming processor
- `site/js/app.js` — all frontend logic (filtering, sorting, pagination, polling, toasts)
- `site/css/style.css` — responsive styles (3-col → 2-col → 1-col, mobile drawer)
- `functions/api/deals.js` — Pages Function serving deals.json from R2
- `functions/api/trigger-scraper.js` — Cloudflare Pages Function for manual trigger
- `.github/workflows/weekly_scrape.yml` — CI/CD automation
