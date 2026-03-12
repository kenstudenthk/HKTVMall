Review the data update pipeline in this project.

Read the following files:
- `src/streaming_processor.py` — deduplicate_and_sort, apply_last_updated, atomic_write_json, upload_to_r2, flush_intermediate, run_streaming_processor
- `.github/workflows/weekly_scrape.yml` — CI schedule, steps, git commit/push
- `build.sh` — static site data copy

Then review for the following:
1. **`last_updated` logic** — Does `apply_last_updated` correctly carry over previous dates for unchanged items? Are the comparison fields (`original_price`, `sale_price`, `in_stock`) sufficient to detect real changes?
2. **Deduplication** — Does `deduplicate_and_sort` correctly deduplicate by `product_code` across categories? Is sort by `discount_pct` descending correct?
3. **Atomic writes** — Does `atomic_write_json` use a temp file on the same filesystem for atomic rename? Is the temp file cleaned up on error?
4. **R2 upload** — Does `upload_to_r2` skip gracefully when credentials are missing? Are intermediate (per-batch) and final uploads both triggered?
5. **CI workflow** — Are all steps in the correct order (scrape → build → upload → commit)? Does the commit stage the right files (`data/deals.json`, `site/data/deals.json`)? Is `build.sh` called so the static fallback stays current?
6. **`previous_lookup` loading** — Does `load_previous_deals` handle missing or malformed `deals.json` safely?

Report all bugs, inconsistencies, or improvements found. For each issue state: file, line number, description, and suggested fix.
