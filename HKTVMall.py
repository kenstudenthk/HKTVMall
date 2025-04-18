import streamlit as st
import requests
from bs4 import BeautifulSoup
from PIL import Image
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time  # Import the time module

def search_hktvmall(keywords, min_price, max_price):
    """
    Searches HKTVmall for products, handling potential advertisements.
    """
    results = []

    for keyword in keywords.split(","):
        keyword = keyword.strip()
        if not keyword:
            continue

        # Set up Chrome options for headless browsing
        chrome_options = Options()
        chrome_options.add_argument("--headless")  # Run Chrome in headless mode (no GUI)
        chrome_options.add_argument("--disable-gpu")  # Disable GPU acceleration (recommended for headless)
        chrome_options.add_argument("--no-sandbox")  # Required for running Chrome as root in Docker/Cloud environments
        chrome_options.add_argument("--disable-dev-shm-usage")  # Overcome limited resource problems

        # Initialize the Chrome webdriver
        driver = webdriver.Chrome(options=chrome_options)

        base_url = "https://www.hktvmall.com/hktv/en/search"
        params = {
            "q": keyword,
        }

        try:
            url = f"{base_url}?q={keyword}"
            driver.get(url)

            # Wait for the advertisement to load (adjust timeout as needed)
            try:
                advertisement = WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "your-advertisement-class"))  # Replace with the correct selector
                )

                # Find the close button (replace with the correct selector)
                close_button = WebDriverWait(driver, 10).until(
                    EC.element_to_be_clickable((By.CLASS_NAME, "your-close-button-class"))
                )

                # Click the close button
                close_button.click()

                # Optional: Wait for the advertisement to disappear (adjust timeout as needed)
                WebDriverWait(driver, 10).until(
                    EC.invisibility_of_element_located((By.CLASS_NAME, "your-advertisement-class"))
                )
            except:
                print("Advertisement not found or could not be closed.")

            # Get the page source after closing the advertisement
            soup = BeautifulSoup(driver.page_source, "html.parser")
            product_listings = soup.find_all("div", class_="product-card")

            if not product_listings:
                st.warning(f"No products found for keyword '{keyword}'.")
                continue

            for product in product_listings:
                try:
                    name_element = product.find("div", class_="product-name")
                    price_element = product.find("span", class_="value")
                    image_element = product.find("img", class_="hktv-lazy-load")
                    link_element = product.find("a", class_="product-link")

                    if not all([name_element, price_element, image_element, link_element]):
                        st.warning("Could not extract all product information. Skipping.")
                        continue

                    product_name = name_element.text.strip()
                    price_text = price_element.text.replace('$', '').replace(',', '')
                    try:
                        product_price = float(price_text)
                    except ValueError:
                        st.warning(f"Could not convert price '{price_text}' to a float. Skipping product.")
                        continue

                    image_url = image_element['data-src']
                    product_link = "https://www.hktvmall.com" + link_element['href']

                    # Filter by price
                    if min_price <= product_price <= max_price:
                        results.append({
                            "name": product_name,
                            "price": product_price,
                            "image_url": image_url,
                            "link": product_link
                        })

                except Exception as e:
                    st.error(f"Error processing product: {e}")

        except requests.exceptions.RequestException as e:
            st.error(f"Error during request for keyword '{keyword}': {e}")

        finally:
            driver.quit()  # Close the browser

    return results

def display_results_as_cards(results):
    """Displays the search results as cards in a Streamlit app."""
    if not results:
        st.info("No matching products found.")
        return

    for product in results:
        with st.container():
            col1, col2 = st.columns([1, 3])  # Adjust column ratio as needed

            with col1:
                try:
                    image = Image.open(requests.get(product["image_url"], stream=True).raw)
                    st.image(image, width=150)  # Adjust image width as needed
                except Exception as e:
                    st.error(f"Error loading image: {e}")

            with col2:
                st.subheader(product["name"])
                st.write(f"Price: ${product['price']:.2f}")
                st.markdown(f"[View Product]({product['link']})", unsafe_allow_html=True)

        st.markdown("---")  # Separator


def main():
    """Main function to run the Streamlit app."""
    st.title("HKTVmall Product Search")

    keywords = st.text_input(
        "Enter keywords (comma-separated):", "mask, sanitizer"
    )  # Default keywords
    min_price, max_price = st.slider(
        "Select price range:", 0.0, 500.0, (0.0, 100.0)
    )  # Default range

    if st.button("Search"):
        with st.spinner("Searching HKTVmall..."):
            results = search_hktvmall(keywords, min_price, max_price)
        display_results_as_cards(results)


if __name__ == "__main__":
    main()