function getOrCreateUserId() {
  let id = localStorage.getItem("rec_user_id");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("rec_user_id", id); }
  return id;
}

function escapeHTML(str) {
  if (typeof str !== "string") return "";
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function formatWeight(g) {
  if (g == null) return "";
  return g >= 1000 ? `${(g / 1000).toFixed(g % 1000 === 0 ? 0 : 1)}kg` : `${g}g`;
}

const els = {
  loader: document.getElementById("rec-loader"),
  grid: document.getElementById("rec-grid"),
  title: document.getElementById("rec-title"),
  subtitle: document.getElementById("rec-subtitle"),
  generatedAt: document.getElementById("rec-generated-at"),
  statusBar: document.getElementById("rec-status"),
  feedbackDialog: document.getElementById("feedback-dialog"),
};

const userId = getOrCreateUserId();

async function init() {
  els.loader.classList.remove("hidden");
  els.grid.innerHTML = "";

  try {
    const res = await fetch(`/api/recommendations?user_id=${encodeURIComponent(userId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    els.loader.classList.add("hidden");

    if (data.cold_start) {
      els.title.textContent = "Top Deals This Week";
      els.subtitle.textContent = "Save products you like with ❤️ on the Deals page — recommendations will personalise to your taste.";
    } else {
      els.title.textContent = "Recommended For You";
      els.subtitle.textContent = "";
    }

    if (data.generated_at) {
      const dt = new Date(data.generated_at);
      els.generatedAt.textContent = `Updated ${dt.toLocaleDateString("en-HK", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })}`;
    }

    if (!data.items || data.items.length === 0) {
      els.grid.innerHTML = '<div class="empty-state">No recommendations available yet. Try again after saving some interests.</div>';
      return;
    }

    els.grid.innerHTML = data.items.map(createRecCardHTML).join("");

    if (data.show_feedback_prompt) {
      setTimeout(() => els.feedbackDialog.classList.remove("hidden"), 1500);
    }

  } catch (err) {
    els.loader.classList.add("hidden");
    els.grid.innerHTML = `<div class="empty-state">Failed to load recommendations: ${escapeHTML(err.message)}</div>`;
  }
}

function createRecCardHTML(deal) {
  const name = escapeHTML(deal.product_name ?? "");
  const brand = escapeHTML(deal.brand ?? "");
  const imgUrl = escapeHTML(deal.image_url ?? "");
  const productUrl = escapeHTML(deal.product_url ?? "");
  const productCode = escapeHTML(deal.product_code ?? "");
  const reason = escapeHTML(deal.reason ?? "");
  const discountPct = Math.round(deal.discount_pct ?? 0);
  const salePrice = Number(deal.sale_price ?? 0).toFixed(2);
  const originalPrice = Number(deal.original_price ?? 0).toFixed(2);
  const stockClass = deal.in_stock ? "in-stock" : "out-of-stock";
  const stockText = deal.in_stock ? "In Stock" : "Out of Stock";
  const placeholder = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect width='120' height='120' fill='%23f5f5f5'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-size='14' fill='%23aaa'%3ENo Image%3C/text%3E%3C/svg%3E`;

  return `<div class="product-card" data-product-code="${productCode}">
    <div class="card-image">
      <img src="${imgUrl}" alt="${name}" loading="lazy" onerror="this.onerror=null;this.src='${placeholder}'">
    </div>
    <div class="card-body">
      ${reason ? `<div class="rec-reason">${reason}</div>` : ""}
      <div class="card-name" title="${name}">${name}</div>
      <div class="card-brand">${brand}</div>
      <div class="card-pricing">
        <span class="card-original-price">$${originalPrice}</span>
        <span class="card-sale-price">$${salePrice}</span>
      </div>
      <div class="card-footer">
        <span class="discount-badge">-${discountPct}%</span>
        <span class="stock-badge ${stockClass}">${stockText}</span>
        ${deal.weight_grams != null ? `<span class="weight-badge">${escapeHTML(formatWeight(deal.weight_grams))}</span>` : ""}
      </div>
    </div>
    <a class="card-link" href="${productUrl}" target="_blank" rel="noopener">View on HKTVmall &rarr;</a>
  </div>`;
}

// Feedback dialog
document.getElementById("feedback-dialog").addEventListener("click", async (e) => {
  const btn = e.target.closest(".feedback-btn");
  if (!btn) return;
  const rating = btn.dataset.rating;
  els.feedbackDialog.classList.add("hidden");

  const viewRes = await fetch(`/api/recommendations?user_id=${encodeURIComponent(userId)}`).catch(() => null);
  const viewCount = viewRes ? (await viewRes.json().catch(() => ({}))).view_count ?? 0 : 0;

  fetch("/api/recommendation-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, rating, view_count: viewCount }),
  }).catch(err => console.warn("Feedback failed:", err));
});

init();
