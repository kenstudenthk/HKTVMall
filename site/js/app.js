const PRODUCTS_PER_PAGE = 30;

const state = {
  allDeals: [],
  filteredDeals: [],
  currentPage: 1,
  selectedCategory: "both",
  filters: {
    minDiscount: 0,
    categories: new Set(["dog_food", "cat_food"]),
    brands: new Set(),
    priceMin: 0,
    priceMax: Infinity,
    inStockOnly: false,
    sort: "discount-desc",
    weightRange: "any",  // "any" | "under-1kg" | "1kg-3kg" | "3kg-5kg" | "over-5kg"
  },
  updateStatus: {
    isPolling: false,
    triggerTime: null,
    lastScrapedDate: null,
    pollInterval: null,
    pollCount: 0,
    countdownInterval: null,
  },
};

// === Recommendation / Interest state ===
function getOrCreateUserId() {
  let id = localStorage.getItem("rec_user_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("rec_user_id", id);
  }
  return id;
}

function loadInterestSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem("hktv_interests") ?? "[]"));
  } catch { return new Set(); }
}

function saveInterestSet(set) {
  localStorage.setItem("hktv_interests", JSON.stringify([...set]));
}

const interestState = {
  userId: getOrCreateUserId(),
  codes: loadInterestSet(),
};

async function toggleInterest(productCode) {
  const deal = state.allDeals.find(d => d.product_code === productCode);
  if (!deal) return;

  const isAdding = !interestState.codes.has(productCode);
  if (isAdding) interestState.codes.add(productCode);
  else interestState.codes.delete(productCode);

  saveInterestSet(interestState.codes);

  // Update button appearance immediately (optimistic UI)
  document.querySelectorAll(`.interest-btn[data-product-code="${CSS.escape(productCode)}"]`).forEach(btn => {
    btn.classList.toggle("interested", isAdding);
    btn.title = isAdding ? "Remove from interests" : "Save to interests";
    btn.setAttribute("aria-label", btn.title);
  });

  // Fire and forget — do not await
  fetch("/api/interests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: interestState.userId,
      event_type: isAdding ? "add" : "remove",
      product_code: deal.product_code,
      product_name: deal.product_name,
      brand: deal.brand,
      category: deal.category,
      weight_grams: deal.weight_grams ?? null,
      sale_price: deal.sale_price,
      original_price: deal.original_price,
      discount_pct: deal.discount_pct,
      in_stock: deal.in_stock,
    }),
  }).catch(err => console.warn("Interest sync failed:", err));
}

// === DOM references ===
const els = {
  loader: document.getElementById("loader"),
  scrapedDate: document.getElementById("scraped-date"),
  updateButton: document.getElementById("update-button"),
  statusBanner: document.getElementById("status-banner"),
  toastContainer: document.getElementById("toast-container"),
  metricTotal: document.getElementById("metric-total"),
  metricAvg: document.getElementById("metric-avg"),
  metricBest: document.getElementById("metric-best"),
  discountSlider: document.getElementById("discount-slider"),
  discountValue: document.getElementById("discount-value"),
  catDog: document.getElementById("cat-dog"),
  catCat: document.getElementById("cat-cat"),
  catDogCount: document.getElementById("cat-dog-count"),
  catCatCount: document.getElementById("cat-cat-count"),
  weightRadios: document.getElementsByName("weight"),
  brandSearch: document.getElementById("brand-search"),
  brandAllBtn: document.getElementById("brand-all-btn"),
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
  scrapeCategorySelector: document.getElementById("scrape-category-selector"),
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

// === Weight filter helper ===
function _weightMatches(weightGrams, range) {
  if (weightGrams == null) return range === "any"; // no weight data → show only if "any"

  const g = weightGrams;
  switch (range) {
    case "under-1kg": return g < 1000;
    case "1kg-3kg":    return g >= 1000 && g <= 3000;
    case "3kg-5kg":    return g > 3000 && g <= 5000;
    case "over-5kg":   return g > 5000;
    default:           return true;
  }
}

// === Toast Notifications ===
function showToast(message, type = "info") {
  const validTypes = ["info", "success", "error"];
  const safeType = validTypes.includes(type) ? type : "info";

  const toast = document.createElement("div");
  toast.className = `toast toast-${safeType}`;
  toast.innerHTML = `
    <div class="toast-icon"></div>
    <div class="toast-message">${escapeHTML(message)}</div>
    <button class="toast-close" aria-label="Close">&times;</button>
  `;

  els.toastContainer.appendChild(toast);

  const closeBtn = toast.querySelector(".toast-close");
  const autoDismiss = setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
    }
  }, 5000);

  closeBtn.addEventListener("click", () => {
    clearTimeout(autoDismiss);
    toast.remove();
  });
}

// === Status Banner ===
function getEstimatedDuration() {
  return state.selectedCategory === "both" ? 180 : 90; // seconds
}

function renderStatusBanner() {
  const { triggerTime } = state.updateStatus;

  if (!triggerTime) {
    hideStatusBanner();
    return;
  }

  const elapsedMs = Date.now() - triggerTime;
  const totalSecs = getEstimatedDuration();
  const pct = Math.min((elapsedMs / (totalSecs * 1000)) * 100, 90);
  const remainingSecs = Math.max(0, totalSecs - Math.floor(elapsedMs / 1000));
  const remM = Math.floor(remainingSecs / 60);
  const remS = remainingSecs % 60;
  const remainingText = remM > 0 ? `~${remM}m ${remS}s left` : `~${remS}s left`;

  els.statusBanner.innerHTML = `
    <div class="status-banner-content">
      <div class="status-text-group">
        <span class="status-banner-icon">🔄</span>
        <span>Data is being updated...</span>
        <span class="countdown-timer">${remainingText}</span>
      </div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill" style="width: ${pct}%"></div>
      </div>
    </div>
    <button class="status-banner-cancel" id="cancel-polling">Cancel</button>
  `;

  els.statusBanner.classList.remove("hidden");

  // Bind cancel button
  const cancelBtn = document.getElementById("cancel-polling");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", stopPolling);
  }
}

function hideStatusBanner() {
  els.statusBanner.classList.add("hidden");
  els.statusBanner.innerHTML = "";
}

function updateCountdown() {
  if (!state.updateStatus.isPolling || !state.updateStatus.triggerTime) return;

  const elapsedMs = Date.now() - state.updateStatus.triggerTime;
  const totalSecs = getEstimatedDuration();
  const pct = Math.min((elapsedMs / (totalSecs * 1000)) * 100, 90);
  const remainingSecs = Math.max(0, totalSecs - Math.floor(elapsedMs / 1000));
  const remM = Math.floor(remainingSecs / 60);
  const remS = remainingSecs % 60;
  const remainingText = remM > 0 ? `~${remM}m ${remS}s left` : `~${remS}s left`;

  const timerEl = document.querySelector(".countdown-timer");
  if (timerEl) timerEl.textContent = remainingText;

  const fillEl = document.querySelector(".progress-bar-fill");
  if (fillEl) fillEl.style.width = `${pct}%`;
}

// === Polling Infrastructure ===
function getNextPollDelay(pollCount) {
  // First 10 minutes: poll every 2 minutes (5 polls)
  if (pollCount < 5) return 2 * 60 * 1000; // 2 minutes

  // Next 15 minutes: poll every 3 minutes (5 polls)
  if (pollCount < 10) return 3 * 60 * 1000; // 3 minutes

  // After that: poll every 5 minutes (4 polls)
  return 5 * 60 * 1000; // 5 minutes
}

async function pollForNewData() {
  if (!state.updateStatus.isPolling) return;

  const maxPolls = 14; // Total polls: 5 + 5 + 4 = 14
  const maxDuration = 40 * 60 * 1000; // 40 minutes

  const elapsed = Date.now() - state.updateStatus.triggerTime;

  // Timeout check
  if (elapsed > maxDuration || state.updateStatus.pollCount >= maxPolls) {
    showToast(
      "Update is taking longer than expected. Check GitHub Actions or try again.",
      "error",
    );
    stopPolling();
    return;
  }

  try {
    // R2 has fresh data immediately after scraping — no need to wait for git redeploy
    const resp = await fetch(`/api/deals?t=${Date.now()}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();

    if (Array.isArray(data) && data.length > 0 && data[0].scraped_date) {
      const newDate = data[0].scraped_date;
      const newCount = data.length;

      // Check if data has been updated (date changed or deal count changed)
      if (
        newDate !== state.updateStatus.lastScrapedDate ||
        newCount !== state.updateStatus.lastDealCount
      ) {
        onNewDataDetected();
        return;
      }
    }

    // Schedule next poll
    state.updateStatus.pollCount++;
    saveUpdateStatusToLocalStorage();

    const delay = getNextPollDelay(state.updateStatus.pollCount);
    state.updateStatus.pollInterval = setTimeout(pollForNewData, delay);
  } catch (err) {
    console.error("Polling error:", err);

    // Retry logic - don't count failed polls
    const delay = 30 * 1000; // Retry after 30 seconds
    state.updateStatus.pollInterval = setTimeout(pollForNewData, delay);
  }
}

function onNewDataDetected() {
  showToast("New deals available! Refreshing page...", "success");
  stopPolling();

  // Reload page after 2 seconds
  setTimeout(() => {
    window.location.reload();
  }, 2000);
}

function startPollingForUpdates() {
  // Store current scraped_date and deal count as baseline
  if (state.allDeals.length > 0 && state.allDeals[0].scraped_date) {
    state.updateStatus.lastScrapedDate = state.allDeals[0].scraped_date;
  }
  state.updateStatus.lastDealCount = state.allDeals.length;

  state.updateStatus.isPolling = true;
  state.updateStatus.triggerTime = Date.now();
  state.updateStatus.pollCount = 0;

  saveUpdateStatusToLocalStorage();
  renderStatusBanner();

  // Start countdown timer (update every second)
  state.updateStatus.countdownInterval = setInterval(updateCountdown, 1000);

  // Start first poll after 1 minute
  const initialDelay = 1 * 60 * 1000;
  state.updateStatus.pollInterval = setTimeout(pollForNewData, initialDelay);

  showToast(
    "Scraper started successfully! Checking for updates automatically...",
    "info",
  );
}

function stopPolling() {
  state.updateStatus.isPolling = false;

  if (state.updateStatus.pollInterval) {
    clearTimeout(state.updateStatus.pollInterval);
    state.updateStatus.pollInterval = null;
  }

  if (state.updateStatus.countdownInterval) {
    clearInterval(state.updateStatus.countdownInterval);
    state.updateStatus.countdownInterval = null;
  }

  hideStatusBanner();
  clearUpdateStatusFromLocalStorage();
}

// === localStorage Persistence ===
function saveUpdateStatusToLocalStorage() {
  const statusData = {
    isPolling: state.updateStatus.isPolling,
    triggerTime: state.updateStatus.triggerTime,
    lastScrapedDate: state.updateStatus.lastScrapedDate,
    pollCount: state.updateStatus.pollCount,
    lastPollTime: Date.now(),
    category: state.selectedCategory,
  };

  try {
    localStorage.setItem("updateStatus", JSON.stringify(statusData));
  } catch (err) {
    console.error("Failed to save update status to localStorage:", err);
  }
}

function clearUpdateStatusFromLocalStorage() {
  try {
    localStorage.removeItem("updateStatus");
  } catch (err) {
    console.error("Failed to clear update status from localStorage:", err);
  }
}

function resumePollingIfNeeded() {
  try {
    const statusStr = localStorage.getItem("updateStatus");
    if (!statusStr) return;

    const statusData = JSON.parse(statusStr);

    // Validate data
    if (!statusData.isPolling || !statusData.triggerTime) {
      clearUpdateStatusFromLocalStorage();
      return;
    }

    const elapsed = Date.now() - statusData.triggerTime;
    const maxDuration = 40 * 60 * 1000; // 40 minutes

    // Check if update is still within timeout window
    if (elapsed > maxDuration) {
      clearUpdateStatusFromLocalStorage();
      return;
    }

    // Resume polling
    state.updateStatus.isPolling = true;
    state.updateStatus.triggerTime = statusData.triggerTime;
    state.updateStatus.lastScrapedDate = statusData.lastScrapedDate;
    state.updateStatus.pollCount = statusData.pollCount;
    state.selectedCategory = statusData.category || "both";

    renderStatusBanner();

    // Start countdown timer
    state.updateStatus.countdownInterval = setInterval(updateCountdown, 1000);

    // Calculate next poll time based on when the last poll actually happened
    const lastPollTime = statusData.lastPollTime || statusData.triggerTime;
    const timeSinceLastPoll = Date.now() - lastPollTime;
    const nextDelay = Math.max(
      0,
      getNextPollDelay(state.updateStatus.pollCount) - timeSinceLastPoll,
    );

    state.updateStatus.pollInterval = setTimeout(pollForNewData, nextDelay);

    showToast("Update in progress (resumed)", "info");
  } catch (err) {
    console.error("Failed to resume polling:", err);
    clearUpdateStatusFromLocalStorage();
  }
}

// === Data fetching ===
async function fetchDeals() {
  // Try R2-backed endpoint first, fall back to static file
  try {
    const resp = await fetch("/api/deals");
    if (resp.ok) return await resp.json();
  } catch (err) {
    console.warn("R2 endpoint unavailable, falling back to static file:", err);
  }

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
    (a, b) => a.localeCompare(b),
  );

  els.brandList.innerHTML = brands
    .map(
      (b) =>
        `<label class="checkbox-label" data-brand="${escapeHTML(b)}">
          <input type="checkbox" value="${escapeHTML(b)}"> ${escapeHTML(b)}
        </label>`,
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
    if (f.weightRange !== "any" && !_weightMatches(d.weight_grams, f.weightRange)) return false;
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
        a.product_name.localeCompare(b.product_name),
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

  const avg = deals.reduce((sum, d) => sum + d.discount_pct, 0) / deals.length;
  const best = Math.max(...deals.map((d) => d.discount_pct));

  els.metricAvg.textContent = `${avg.toFixed(1)}%`;
  els.metricBest.textContent = `${best.toFixed(1)}%`;
}

function renderCategoryCounts() {
  const dogCount = state.allDeals.filter((d) => d.category === "dog_food").length;
  const catCount = state.allDeals.filter((d) => d.category === "cat_food").length;
  els.catDogCount.textContent = `(${dogCount})`;
  els.catCatCount.textContent = `(${catCount})`;
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
  const productCode = escapeHTML(deal.product_code);
  const originalPrice = Number(deal.original_price).toFixed(2);
  const salePrice = Number(deal.sale_price).toFixed(2);
  const discountPct = Math.round(deal.discount_pct);
  const stockClass = deal.in_stock ? "in-stock" : "out-of-stock";
  const stockText = deal.in_stock ? "In Stock" : "Out of Stock";
  const isInterested = interestState.codes.has(deal.product_code);

  const placeholderSVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' fill='%23ccc'%3E%3Crect width='120' height='120' fill='%23f5f5f5'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-size='14' fill='%23aaa'%3ENo Image%3C/text%3E%3C/svg%3E`;

  return `<div class="product-card" data-product-code="${productCode}" data-product-url="${productUrl}">
    <div class="card-image">
      <img src="${imgUrl}" alt="${name}" loading="lazy"
           onerror="this.onerror=null;this.src='${placeholderSVG}'">
      <button class="refresh-btn" title="Refresh price" aria-label="Refresh price">&#x21BB;</button>
      <button class="interest-btn ${isInterested ? 'interested' : ''}"
        data-product-code="${productCode}"
        title="${isInterested ? 'Remove from interests' : 'Save to interests'}"
        aria-label="${isInterested ? 'Remove from interests' : 'Save to interests'}">&#x2665;</button>
    </div>
    <div class="card-body">
      <div class="card-name" title="${name}">${name}</div>
      <div class="card-brand">${brand}</div>
      <div class="card-pricing">
        <span class="card-original-price js-original-price">$${originalPrice}</span>
        <span class="card-sale-price js-sale-price">$${salePrice}</span>
      </div>
      <div class="card-footer">
        <span class="discount-badge js-discount-badge">-${discountPct}%</span>
        <span class="stock-badge ${stockClass} js-stock-badge">${stockText}</span>
        ${deal.weight_grams != null ? `<span class="weight-badge">${escapeHTML(formatWeight(deal.weight_grams))}</span>` : ""}
      </div>
      ${deal.last_updated ? `<div class="card-updated">${escapeHTML(formatLastUpdated(deal.last_updated))}</div>` : ""}
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

  // Brand "All" button — selects all brands so you can uncheck the few you don't want
  els.brandAllBtn.addEventListener("click", () => {
    state.filters.brands.clear();
    els.brandList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = true;
      state.filters.brands.add(cb.value);
    });
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

  // Weight filter
  els.weightRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      state.filters.weightRange = radio.value;
      applyFiltersAndRender();
    });
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
      state.filteredDeals.length / PRODUCTS_PER_PAGE,
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

  // Per-card price refresh (delegated)
  els.productGrid.addEventListener("click", async (e) => {
    const btn = e.target.closest(".refresh-btn");
    if (!btn) return;

    const card = btn.closest(".product-card");
    const code = card.dataset.productCode;
    const url = card.dataset.productUrl;

    if (btn.classList.contains("refreshing")) return; // debounce

    btn.classList.add("refreshing");
    btn.classList.remove("success", "error");

    try {
      const res = await fetch(
        `/api/refresh-product?code=${encodeURIComponent(code)}&url=${encodeURIComponent(url)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      card.querySelector(".js-original-price").textContent =
        `$${Number(data.original_price).toFixed(2)}`;
      card.querySelector(".js-sale-price").textContent =
        `$${Number(data.sale_price).toFixed(2)}`;
      card.querySelector(".js-discount-badge").textContent =
        `-${Math.round(data.discount_pct)}%`;
      const stockEl = card.querySelector(".js-stock-badge");
      stockEl.textContent = data.in_stock ? "In Stock" : "Out of Stock";
      stockEl.className = `stock-badge js-stock-badge ${data.in_stock ? "in-stock" : "out-of-stock"}`;

      // Update "last updated" timestamp to reflect this live check
      const updatedEl = card.querySelector(".card-updated");
      if (updatedEl) {
        updatedEl.textContent = "Price checked just now";
      }

      btn.classList.remove("refreshing");
      btn.classList.add("success");
      setTimeout(() => btn.classList.remove("success"), 2000);
    } catch (err) {
      btn.classList.remove("refreshing");
      btn.classList.add("error");
      setTimeout(() => btn.classList.remove("error"), 2000);
      console.error("Refresh failed:", err);
    }
  });

  // Interest button (delegated)
  els.productGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".interest-btn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const code = btn.dataset.productCode;
    if (code) toggleInterest(code);
  });
}

function closeFilterPanel() {
  els.filterPanel.classList.remove("open");
  els.filterOverlay.classList.remove("active");
}

// === Scrape Category Selector ===
function bindScrapeCategorySelector() {
  if (!els.scrapeCategorySelector) return;
  els.scrapeCategorySelector.addEventListener("click", (e) => {
    const btn = e.target.closest(".scrape-cat-btn");
    if (!btn) return;
    state.selectedCategory = btn.dataset.category;
    els.scrapeCategorySelector
      .querySelectorAll(".scrape-cat-btn")
      .forEach((b) => b.classList.toggle("active", b === btn));
  });
}

// === Manual Update Button ===
async function triggerScraper() {
  // Prevent triggering while already polling
  if (state.updateStatus.isPolling) {
    showToast("Update already in progress", "info");
    return;
  }

  const updateBtn = document.getElementById("update-button");
  const btnText = updateBtn.querySelector(".button-text");
  const btnLoading = updateBtn.querySelector(".button-loading");

  // Disable button and show loading state
  updateBtn.disabled = true;
  btnText.style.display = "none";
  btnLoading.style.display = "inline";

  try {
    const response = await fetch("/api/trigger-scraper", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ category: state.selectedCategory }),
    });

    const result = await response.json();

    if (result.success) {
      // Start polling for updates
      startPollingForUpdates();
    } else {
      showToast(`Failed to trigger scraper: ${result.error}`, "error");
    }
  } catch (error) {
    console.error("Error triggering scraper:", error);
    showToast(`Error triggering scraper: ${error.message}`, "error");
  } finally {
    // Re-enable button
    updateBtn.disabled = false;
    btnText.style.display = "inline";
    btnLoading.style.display = "none";
  }
}

// === Date Formatting ===
function formatScrapedDate(dateStr) {
  if (!dateStr) return "";

  try {
    // Parse date string (format: YYYY-MM-DD)
    const [year, month, day] = dateStr.split("-").map(Number);
    const scrapedDate = new Date(year, month - 1, day);
    const now = new Date();

    // Calculate days difference
    const diffTime = now - scrapedDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    // Format absolute date
    const options = { year: "numeric", month: "short", day: "numeric" };
    const formattedDate = scrapedDate.toLocaleDateString("en-US", options);

    // Add relative time
    let relativeTime = "";
    if (diffDays === 0) {
      relativeTime = " (today)";
    } else if (diffDays === 1) {
      relativeTime = " (yesterday)";
    } else if (diffDays > 1 && diffDays <= 7) {
      relativeTime = ` (${diffDays} days ago)`;
    } else if (diffDays > 7) {
      const weeks = Math.floor(diffDays / 7);
      relativeTime = ` (${weeks} week${weeks > 1 ? "s" : ""} ago)`;
    }

    return `Last updated: ${formattedDate}${relativeTime}`;
  } catch (err) {
    return `Last updated: ${dateStr}`;
  }
}

// === Per-item Date Formatting ===
function formatWeight(grams) {
  if (grams == null) return "";
  if (grams >= 1000) return `${+(grams / 1000).toFixed(2)}kg`;
  return `${Math.round(grams)}g`;
}

function formatLastUpdated(dateStr) {
  if (!dateStr) return "";

  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const updated = new Date(year, month - 1, day);
    const now = new Date();
    const diffDays = Math.floor((now - updated) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Updated today";
    if (diffDays === 1) return "Updated yesterday";
    if (diffDays <= 7) return `Updated ${diffDays} days ago`;

    const options = { month: "short", day: "numeric" };
    return `Updated ${updated.toLocaleDateString("en-US", options)}`;
  } catch {
    return `Updated ${dateStr}`;
  }
}

// === Init ===
async function init() {
  els.loader.style.display = "block";
  const deals = await fetchDeals();
  els.loader.style.display = "none";

  state.allDeals = deals;

  if (deals.length > 0 && deals[0].scraped_date) {
    els.scrapedDate.textContent = formatScrapedDate(deals[0].scraped_date);
  }

  populateBrands(deals);
  setupPriceRange(deals);
  renderCategoryCounts();
  bindEvents();
  bindScrapeCategorySelector();
  applyFiltersAndRender();

  // Attach update button listener
  const updateBtn = document.getElementById("update-button");
  if (updateBtn) {
    updateBtn.addEventListener("click", triggerScraper);
  }

  // Resume polling if needed
  resumePollingIfNeeded();
}

init();
