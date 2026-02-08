const PRODUCTS_PER_PAGE = 30;

const state = {
  allDeals: [],
  filteredDeals: [],
  currentPage: 1,
  filters: {
    minDiscount: 0,
    categories: new Set(["dog_food", "cat_food"]),
    brands: new Set(),
    priceMin: 0,
    priceMax: Infinity,
    inStockOnly: false,
    sort: "discount-desc",
  },
};

// === DOM references ===
const els = {
  scrapedDate: document.getElementById("scraped-date"),
  metricTotal: document.getElementById("metric-total"),
  metricAvg: document.getElementById("metric-avg"),
  metricBest: document.getElementById("metric-best"),
  discountSlider: document.getElementById("discount-slider"),
  discountValue: document.getElementById("discount-value"),
  catDog: document.getElementById("cat-dog"),
  catCat: document.getElementById("cat-cat"),
  brandSearch: document.getElementById("brand-search"),
  brandList: document.getElementById("brand-list"),
  priceMin: document.getElementById("price-min"),
  priceMax: document.getElementById("price-max"),
  priceMinDisplay: document.getElementById("price-min-display"),
  priceMaxDisplay: document.getElementById("price-max-display"),
  sortSelect: document.getElementById("sort-select"),
  inStockOnly: document.getElementById("in-stock-only"),
  productGrid: document.getElementById("product-grid"),
  resultsStatus: document.getElementById("results-status"),
  prevBtn: document.getElementById("prev-btn"),
  nextBtn: document.getElementById("next-btn"),
  pageIndicator: document.getElementById("page-indicator"),
  filterPanel: document.getElementById("filter-panel"),
  filterToggleBtn: document.getElementById("filter-toggle-btn"),
  filterCloseBtn: document.getElementById("filter-close-btn"),
  filterOverlay: document.getElementById("filter-overlay"),
};

// === Utility ===
function escapeHTML(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// === Data fetching ===
async function fetchDeals() {
  try {
    const resp = await fetch("data/deals.json");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.error("Failed to load deals:", err);
    return [];
  }
}

// === Brand population ===
function populateBrands(deals) {
  const brands = [...new Set(deals.map((d) => d.brand).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b)
  );

  els.brandList.innerHTML = brands
    .map(
      (b) =>
        `<label class="checkbox-label" data-brand="${escapeHTML(b)}">
          <input type="checkbox" value="${escapeHTML(b)}"> ${escapeHTML(b)}
        </label>`
    )
    .join("");
}

// === Price range setup ===
function setupPriceRange(deals) {
  if (deals.length === 0) return;
  const prices = deals.map((d) => d.sale_price);
  const min = Math.floor(Math.min(...prices));
  const max = Math.ceil(Math.max(...prices));

  els.priceMin.min = min;
  els.priceMin.max = max;
  els.priceMin.value = min;

  els.priceMax.min = min;
  els.priceMax.max = max;
  els.priceMax.value = max;

  state.filters.priceMin = min;
  state.filters.priceMax = max;

  els.priceMinDisplay.textContent = `$${min}`;
  els.priceMaxDisplay.textContent = `$${max}`;
}

// === Filtering ===
function applyFiltersAndRender() {
  const f = state.filters;

  state.filteredDeals = state.allDeals.filter((d) => {
    if (d.discount_pct < f.minDiscount) return false;
    if (!f.categories.has(d.category)) return false;
    if (f.brands.size > 0 && !f.brands.has(d.brand)) return false;
    if (d.sale_price < f.priceMin || d.sale_price > f.priceMax) return false;
    if (f.inStockOnly && !d.in_stock) return false;
    return true;
  });

  // Sort
  switch (f.sort) {
    case "discount-desc":
      state.filteredDeals.sort((a, b) => b.discount_pct - a.discount_pct);
      break;
    case "price-asc":
      state.filteredDeals.sort((a, b) => a.sale_price - b.sale_price);
      break;
    case "price-desc":
      state.filteredDeals.sort((a, b) => b.sale_price - a.sale_price);
      break;
    case "name-asc":
      state.filteredDeals.sort((a, b) =>
        a.product_name.localeCompare(b.product_name)
      );
      break;
  }

  state.currentPage = 1;
  render();
}

// === Rendering ===
function render() {
  renderMetrics();
  renderGrid();
  renderPagination();
  renderResultsStatus();
}

function renderMetrics() {
  const deals = state.filteredDeals;
  els.metricTotal.textContent = deals.length;

  if (deals.length === 0) {
    els.metricAvg.textContent = "N/A";
    els.metricBest.textContent = "N/A";
    return;
  }

  const avg =
    deals.reduce((sum, d) => sum + d.discount_pct, 0) / deals.length;
  const best = Math.max(...deals.map((d) => d.discount_pct));

  els.metricAvg.textContent = `${avg.toFixed(1)}%`;
  els.metricBest.textContent = `${best.toFixed(1)}%`;
}

function renderGrid() {
  const total = state.filteredDeals.length;

  if (total === 0) {
    els.productGrid.innerHTML =
      '<div class="empty-state">No deals match your filters. Try adjusting the settings.</div>';
    return;
  }

  const start = (state.currentPage - 1) * PRODUCTS_PER_PAGE;
  const end = Math.min(start + PRODUCTS_PER_PAGE, total);
  const page = state.filteredDeals.slice(start, end);

  els.productGrid.innerHTML = page.map(createCardHTML).join("");
}

function createCardHTML(deal) {
  const name = escapeHTML(deal.product_name);
  const brand = escapeHTML(deal.brand);
  const imgUrl = escapeHTML(deal.image_url);
  const productUrl = escapeHTML(deal.product_url);
  const originalPrice = Number(deal.original_price).toFixed(2);
  const salePrice = Number(deal.sale_price).toFixed(2);
  const discountPct = Math.round(deal.discount_pct);
  const stockClass = deal.in_stock ? "in-stock" : "out-of-stock";
  const stockText = deal.in_stock ? "In Stock" : "Out of Stock";

  const placeholderSVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' fill='%23ccc'%3E%3Crect width='120' height='120' fill='%23f5f5f5'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-size='14' fill='%23aaa'%3ENo Image%3C/text%3E%3C/svg%3E`;

  return `<div class="product-card">
    <div class="card-image">
      <img src="${imgUrl}" alt="${name}" loading="lazy"
           onerror="this.onerror=null;this.src='${placeholderSVG}'">
    </div>
    <div class="card-body">
      <div class="card-name" title="${name}">${name}</div>
      <div class="card-brand">${brand}</div>
      <div class="card-pricing">
        <span class="card-original-price">$${originalPrice}</span>
        <span class="card-sale-price">$${salePrice}</span>
      </div>
      <div class="card-footer">
        <span class="discount-badge">-${discountPct}%</span>
        <span class="stock-badge ${stockClass}">${stockText}</span>
      </div>
    </div>
    <a class="card-link" href="${productUrl}" target="_blank" rel="noopener">View on HKTVmall &rarr;</a>
  </div>`;
}

function renderPagination() {
  const total = state.filteredDeals.length;
  const totalPages = Math.max(1, Math.ceil(total / PRODUCTS_PER_PAGE));

  els.prevBtn.disabled = state.currentPage <= 1;
  els.nextBtn.disabled = state.currentPage >= totalPages;
  els.pageIndicator.textContent = `Page ${state.currentPage} of ${totalPages}`;
}

function renderResultsStatus() {
  const total = state.filteredDeals.length;
  if (total === 0) {
    els.resultsStatus.textContent = "No matching deals";
    return;
  }
  const start = (state.currentPage - 1) * PRODUCTS_PER_PAGE + 1;
  const end = Math.min(state.currentPage * PRODUCTS_PER_PAGE, total);
  els.resultsStatus.textContent = `Showing ${start}\u2013${end} of ${total} deals`;
}

// === Event binding ===
function bindEvents() {
  // Discount slider
  els.discountSlider.addEventListener("input", () => {
    const val = Number(els.discountSlider.value);
    state.filters.minDiscount = val;
    els.discountValue.textContent = `${val}%`;
    applyFiltersAndRender();
  });

  // Category checkboxes
  els.catDog.addEventListener("change", () => {
    if (els.catDog.checked) state.filters.categories.add("dog_food");
    else state.filters.categories.delete("dog_food");
    applyFiltersAndRender();
  });

  els.catCat.addEventListener("change", () => {
    if (els.catCat.checked) state.filters.categories.add("cat_food");
    else state.filters.categories.delete("cat_food");
    applyFiltersAndRender();
  });

  // Brand checkboxes (delegated)
  els.brandList.addEventListener("change", (e) => {
    if (e.target.type !== "checkbox") return;
    if (e.target.checked) state.filters.brands.add(e.target.value);
    else state.filters.brands.delete(e.target.value);
    applyFiltersAndRender();
  });

  // Brand search
  els.brandSearch.addEventListener("input", () => {
    const query = els.brandSearch.value.toLowerCase();
    const labels = els.brandList.querySelectorAll(".checkbox-label");
    labels.forEach((label) => {
      const brand = label.dataset.brand.toLowerCase();
      label.classList.toggle("hidden", !brand.includes(query));
    });
  });

  // Price range (dual slider)
  els.priceMin.addEventListener("input", () => {
    let minVal = Number(els.priceMin.value);
    const maxVal = Number(els.priceMax.value);
    if (minVal > maxVal) {
      minVal = maxVal;
      els.priceMin.value = minVal;
    }
    state.filters.priceMin = minVal;
    els.priceMinDisplay.textContent = `$${minVal}`;
    applyFiltersAndRender();
  });

  els.priceMax.addEventListener("input", () => {
    const minVal = Number(els.priceMin.value);
    let maxVal = Number(els.priceMax.value);
    if (maxVal < minVal) {
      maxVal = minVal;
      els.priceMax.value = maxVal;
    }
    state.filters.priceMax = maxVal;
    els.priceMaxDisplay.textContent = `$${maxVal}`;
    applyFiltersAndRender();
  });

  // Sort
  els.sortSelect.addEventListener("change", () => {
    state.filters.sort = els.sortSelect.value;
    applyFiltersAndRender();
  });

  // In stock only
  els.inStockOnly.addEventListener("change", () => {
    state.filters.inStockOnly = els.inStockOnly.checked;
    applyFiltersAndRender();
  });

  // Pagination
  els.prevBtn.addEventListener("click", () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  els.nextBtn.addEventListener("click", () => {
    const totalPages = Math.ceil(
      state.filteredDeals.length / PRODUCTS_PER_PAGE
    );
    if (state.currentPage < totalPages) {
      state.currentPage++;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  // Mobile filter toggle
  els.filterToggleBtn.addEventListener("click", () => {
    els.filterPanel.classList.add("open");
    els.filterOverlay.classList.add("active");
  });

  els.filterCloseBtn.addEventListener("click", closeFilterPanel);
  els.filterOverlay.addEventListener("click", closeFilterPanel);
}

function closeFilterPanel() {
  els.filterPanel.classList.remove("open");
  els.filterOverlay.classList.remove("active");
}

// === Init ===
async function init() {
  const deals = await fetchDeals();
  state.allDeals = deals;

  if (deals.length > 0 && deals[0].scraped_date) {
    els.scrapedDate.textContent = `Last updated: ${deals[0].scraped_date}`;
  }

  populateBrands(deals);
  setupPriceRange(deals);
  bindEvents();
  applyFiltersAndRender();
}

init();
