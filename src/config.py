"""Configuration for HKTVmall Pet Food Discount Finder."""

import os
from pathlib import Path

# --- Paths ---
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
RAW_PRODUCTS_PATH = DATA_DIR / "raw_products.json"
DEALS_PATH = DATA_DIR / "deals.json"

# --- HKTVmall cate-search API ---
CATE_SEARCH_API_URL = "https://cate-search.hktvmall.com/query/products"
BASE_URL = "https://www.hktvmall.com"

# Category codes (HKTVmall internal structure)
CATEGORIES = {
    "dog_food": {
        "code": "AA83100510000",
        "label": "Dog Food",
        "query": ":relevance:category:AA83100510000:zone:pets:street:main:",
    },
    "cat_food": {
        "code": "AA83200510000",
        "label": "Cat Food",
        "query": ":relevance:category:AA83200510000:zone:pets:street:main:",
    },
}

# --- Scraper settings ---
PAGE_SIZE = 60  # max allowed by cate-search API
MAX_PAGES = 250
REQUEST_DELAY = 1.0  # seconds between API requests
API_TIMEOUT = 30_000  # ms

# --- Email settings (from environment variables) ---
EMAIL_SENDER = os.environ.get("EMAIL_SENDER", "")
EMAIL_PASSWORD = os.environ.get("EMAIL_PASSWORD", "")
EMAIL_RECIPIENT = os.environ.get("EMAIL_RECIPIENT", "")
SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587

# --- Dashboard settings ---
PRODUCTS_PER_PAGE = 30
