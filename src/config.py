"""Configuration for HKTVmall Pet Food Discount Finder."""

import os
from pathlib import Path

# --- Paths ---
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
RAW_PRODUCTS_PATH = DATA_DIR / "raw_products.json"
DEALS_PATH = DATA_DIR / "deals.json"

# --- HKTVmall AJAX API ---
AJAX_API_URL = "https://www.hktvmall.com/hktv/en/ajax/search_products"
BASE_URL = "https://www.hktvmall.com"

# Category codes (HKTVmall internal structure)
CATEGORIES = {
    "dog_food": {
        "code": "AA83100500000",
        "label": "Dog Food",
        "search_url": (
            "https://www.hktvmall.com/hktv/en/main/Pets/s/H0803001"
            "?q=%3Arelevance%3Astreet%3Amain%3Acategory%3AAA83100500000"
        ),
    },
    "cat_food": {
        "code": "AA83200500000",
        "label": "Cat Food",
        "search_url": (
            "https://www.hktvmall.com/hktv/en/main/Pets/s/H0803001"
            "?q=%3Arelevance%3Astreet%3Amain%3Acategory%3AAA83200500000"
        ),
    },
}

# --- Scraper settings ---
PAGE_SIZE = 600
MAX_PAGES = 100
REQUEST_DELAY = 2.0  # seconds between page navigations
NAVIGATION_TIMEOUT = 60_000  # ms
AJAX_WAIT_TIMEOUT = 30_000  # ms

# --- Email settings (from environment variables) ---
EMAIL_SENDER = os.environ.get("EMAIL_SENDER", "")
EMAIL_PASSWORD = os.environ.get("EMAIL_PASSWORD", "")
EMAIL_RECIPIENT = os.environ.get("EMAIL_RECIPIENT", "")
SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587

# --- Dashboard settings ---
PRODUCTS_PER_PAGE = 30
