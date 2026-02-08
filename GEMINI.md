# HKTVmall Pet Food Deal Finder

## Project Overview

This project is a web scraper and data processing pipeline that finds the best deals on pet food from HKTVmall. It consists of three main components:

1.  **Scraper (`src/scraper.py`):** A Python script using `playwright` to fetch product data directly from HKTVmall's internal search API for predefined cat and dog food categories.
2.  **Processor (`src/processor.py`):** A Python script that takes the raw scraped data, calculates discount percentages, filters for actual deals, and saves the cleaned data to `data/deals.json`.
3.  **Frontend (`site/`):** A static HTML/CSS/JS single-page application that displays the deals from `site/data/deals.json`. It provides filtering, sorting, and pagination for a user-friendly experience.

The entire process is automated via a GitHub Actions workflow (`.github/workflows/weekly_scrape.yml`) that runs weekly on Sundays. This workflow executes the scraper and processor, commits the updated data back to the repository, and sends an email digest of the top deals.

### Technologies Used

*   **Backend:** Python 3.12, Playwright
*   **Frontend:** Vanilla JavaScript, HTML5, CSS3
*   **CI/CD:** GitHub Actions

## Building and Running

### Prerequisites

*   Python 3.12+
*   Node.js (for a local development server, e.g., `http-server`)

### Setup and Execution

1.  **Install Python dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

2.  **Install Playwright browser dependencies:**
    This is required for the scraper to run.
    ```bash
    python -m playwright install chromium --with-deps
    ```

3.  **Run the full data pipeline:**
    You can run the scripts individually to refresh the data.

    *   **Scrape raw data:**
        ```bash
        python -m src.scraper
        ```
        This will create/update `data/raw_products.json`.

    *   **Process deals:**
        ```bash
        python -m src.processor
        ```
        This will use the raw data to create/update `data/deals.json`.

4.  **View the frontend:**
    After processing, the `build.sh` script copies the final deals data into the `site` directory.

    *   **Run the build script:**
        ```bash
        ./build.sh
        ```

    *   **Serve the site:**
        Use any simple static file server. For example, using `http-server`:
        ```bash
        # If you don't have http-server installed: npm install -g http-server
        http-server site/
        ```
        The application will be available at `http://localhost:8080`.

### Running the Emailer

The emailer script (`src/emailer.py`) sends a digest of the top deals. It requires SMTP credentials to be set as environment variables.

```bash
export EMAIL_SENDER="your-email@gmail.com"
export EMAIL_PASSWORD="your-app-password"
export EMAIL_RECIPIENT="recipient-email@example.com"

python -m src.emailer
```

## Development Conventions

*   **Data Flow:** The data flows from scraper -> processor -> JSON file -> frontend. The `data/` directory is the source of truth for the site.
*   **Automation:** The primary way to update data is through the GitHub Actions workflow, which runs on a schedule or can be triggered manually.
*   **Configuration:** Project settings are centralized in `src/config.py`. This includes API endpoints, categories to scrape, and email settings.
*   **Frontend Logic:** All frontend logic is contained within `site/js/app.js`. It's written in vanilla JavaScript and handles data fetching, filtering, rendering, and UI interactions.
*   **Styling:** Styles are located in `site/css/style.css`.
*   **Secrets:** Sensitive information like email credentials should not be hardcoded. They are read from environment variables and should be configured as GitHub Actions secrets in the repository settings.
