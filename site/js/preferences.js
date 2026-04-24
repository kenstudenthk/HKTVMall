/**
 * Preferences page logic — load user prefs and save via API.
 */

const USER_ID = new URLSearchParams(window.location.search).get("user_id") || "969421392";

const $ = (id) => document.getElementById(id);

// ── Toast helper ────────────────────────────────────────────────────────────────
function showToast(msg, type = "info") {
  const el = $("toast");
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => (el.className = "toast"), 3000);
}

// ── Load current user prefs ───────────────────────────────────────────────────
async function loadPrefs() {
  try {
    const resp = await fetch("/api/preferences");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const users = data.users || [];
    const user = users.find((u) => u.user_id === USER_ID);
    if (user) applyPrefs(user.filters);
    $("user-badge").textContent = `User ID: ${USER_ID}`;
    updatePreview();
  } catch {
    $("user-badge").textContent = `User ID: ${USER_ID}`;
    updatePreview();
  }
}

// ── Apply prefs to form fields ────────────────────────────────────────────────
function applyPrefs(f) {
  if (!f) return;
  $("alert-enabled").checked = f.alert_enabled !== false;
  $("max-deals").value = f.max_deals || 10;
  $("cat-dog").checked = f.categories?.includes("dog_food") ?? true;
  $("cat-cat").checked = f.categories?.includes("cat_food") ?? true;
  $("min-discount").value = f.min_discount ?? 30;
  $("brands").value = (f.brands || []).join(", ");
  $("price-min").value = f.price_min ?? 0;
  $("price-max").value = f.price_max ?? 1000;
  $("weight-range").value = f.weight_range || "any";
  $("in-stock-only").checked = f.in_stock_only === true;
}

// ── Read form values into a filters object ───────────────────────────────────
function readForm() {
  const brandsRaw = $("brands").value;
  const brands = brandsRaw
    ? brandsRaw.split(",").map((b) => b.trim()).filter(Boolean)
    : [];

  const categories = [];
  if ($("cat-dog").checked) categories.push("dog_food");
  if ($("cat-cat").checked) categories.push("cat_food");

  return {
    alert_enabled: $("alert-enabled").checked,
    max_deals: parseInt($("max-deals").value, 10) || 10,
    categories,
    min_discount: parseInt($("min-discount").value, 10) || 0,
    brands,
    price_min: parseInt($("price-min").value, 10) || 0,
    price_max: parseInt($("price-max").value, 10) || 1000,
    weight_range: $("weight-range").value,
    in_stock_only: $("in-stock-only").checked,
  };
}

// ── Update preview text ───────────────────────────────────────────────────────
async function updatePreview() {
  const filters = readForm();
  const cats = filters.categories.join(" + ") || "none";
  const brands = filters.brands.length ? filters.brands.join(", ") : "all";
  const weightMap = {
    any: "any",
    "under-1kg": "< 1kg",
    "1kg-3kg": "1–3kg",
    "3kg-5kg": "3–5kg",
    "over-5kg": "> 5kg",
  };
  const weight = weightMap[filters.weight_range] || "any";

  // Fetch deals to count how many match
  let matchCount = "—";
  try {
    const resp = await fetch("/api/deals");
    if (resp.ok) {
      const deals = await resp.json();
      const matched = filterDeals(deals, filters);
      matchCount = matched.length;
    }
  } catch { /* ignore */ }

  $("alert-preview").innerHTML = `
    <strong>Your Friday alert will look like:</strong><br>
    • Categories: ${cats}<br>
    • Min discount: ${filters.min_discount}%<br>
    • Brands: ${brands}<br>
    • Price: HK$${filters.price_min} – HK$${filters.price_max}<br>
    • Weight: ${weight}<br>
    • In stock only: ${filters.in_stock_only ? "Yes" : "No"}<br>
    • Max deals: ${filters.max_deals}<br>
    <br>
    <strong>↳ ~${matchCount} deals match today</strong>
  `;
}

// ── Client-side filter (mirrors app.js logic) ────────────────────────────────
function filterDeals(deals, f) {
  return deals.filter((d) => {
    if (d.discount_pct < f.min_discount) return false;
    if (!f.categories.includes(d.category)) return false;
    if (f.brands.length > 0 && !f.brands.includes(d.brand)) return false;
    if (d.sale_price < f.price_min || d.sale_price > f.price_max) return false;
    if (f.in_stock_only && !d.in_stock) return false;
    if (f.weight_range !== "any") {
      if (!_weightMatches(d.weight_grams, f.weight_range)) return false;
    }
    return true;
  });
}

function _weightMatches(weightGrams, range) {
  if (weightGrams == null) return false;
  const g = weightGrams;
  switch (range) {
    case "under-1kg": return g < 1000;
    case "1kg-3kg":    return g >= 1000 && g <= 3000;
    case "3kg-5kg":    return g > 3000 && g <= 5000;
    case "over-5kg":   return g > 5000;
    default:           return true;
  }
}

// ── Save ─────────────────────────────────────────────────────────────────────
$("save-btn").addEventListener("click", async () => {
  const btn = $("save-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";

  const filters = readForm();
  if (filters.categories.length === 0) {
    showToast("Please select at least one category (Dog or Cat)", "error");
    btn.disabled = false;
    btn.textContent = "💾 Save Preferences";
    return;
  }

  try {
    const resp = await fetch(`/api/preferences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: USER_ID, filters }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    showToast("Preferences saved! ✅", "success");
  } catch (e) {
    showToast("Failed to save: " + e.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "💾 Save Preferences";
  }
});

// Re-render preview on any input change
document.querySelectorAll(
  "input, select"
).forEach((el) => {
  el.addEventListener("input", updatePreview);
  el.addEventListener("change", updatePreview);
});

loadPrefs();
