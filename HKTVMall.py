import streamlit as st
import requests
from bs4 import BeautifulSoup
from PIL import Image  # Import Pillow for image handling

def search_hktvmall(keywords, min_price, max_price):
    """
    Searches HKTVmall for products matching the given keywords and price range.

    Args:
        keywords (str): Comma-separated keywords to search for.
        min_price (float): The minimum price of the product.
        max_price (float): The maximum price of the product.

    Returns:
        list: A list of dictionaries, where each dictionary represents a product
              and contains its name, price, image URL, and product link.
    """

    base_url = "https://www.hktvmall.com/"
    results = []

    for keyword in keywords.split(","):  # Split keywords by comma
        keyword = keyword.strip()  # Remove leading/trailing spaces
        if not keyword:  # Skip empty keywords
            continue

        params = {
            "q": keyword,
        }

        try:
            response = requests.get(base_url, params=params)
            response.raise_for_status()
        except requests.exceptions.RequestException as e:
            st.error(f"Error during request for keyword '{keyword}': {e}")
            continue  # Move to the next keyword

        soup = BeautifulSoup(response.content, "html.parser")
        product_listings = soup.find_all("div", class_="product-card")

        if not product_listings:
            st.warning(f"No products found for keyword '{keyword}'.")
            continue  # Move to the next keyword

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