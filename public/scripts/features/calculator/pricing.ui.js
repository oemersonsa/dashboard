import { state, saveState, normalizePricingProfile } from "../../core/state.js";
import { R, escapeAttribute } from "../../core/format.js";
import { MARKETPLACE_PRICING_PRESETS } from "../../core/constants.js";
import { platformBadge } from "../../ui/icons.js";
import { toastSuccess, toastError } from "../../ui/toast.js";
import {
  calculatePlatformPrice, calculateSalePriceResult,
  getPricingBaseCost, getPsychologicalPriceOptions,
  getProfileFeeTiersPublic, validateFeeTiers
} from "./pricing.calc.js";

let bound = false;
let selectedPlatformKey = "";
const PRODUCT_FIELDS = ["productCost", "packagingCost", "extraCost", "shippingSubsidy", "taxRate", "returnReserveRate", "manualPrice"];

export function init() {
  render();
  if (!bound) { bindEvents(); bound = true; }
}

function getProfile(platform) {
  return state.pricing.profiles[platform.key] || normalizePricingProfile(platform, {}, MARKETPLACE_PRICING_PRESETS);
}

function activeProduct() {
  return state.pricing.products.find((product) => product.id === state.pricing.activeProductId) || state.pricing.products[0];
}

function syncProduct() {
  const product = activeProduct();
  if (!product) return;
  PRODUCT_FIELDS.forEach((field) => { product[field] = Number(state.pricing[field] || 0); });
}

function render() {
  const setVal = (id, value) => { const el = document.getElementById(id); if (el) el.value = value; };
  const product = activeProduct();
  const select = document.getElementById("pricingProductSelect");
  if (select) {
    select.innerHTML = state.pricing.products.map((p) => `<option value="${escapeAttribute(p.id)}">${escapeAttribute(p.name)}${p.sku ? ` · ${escapeAttribute(p.sku)}` : ""}</option>`).join("");
    select.value = product?.id || "";
  }
  const platformSelect = document.getElementById("pricingPlatformSelect");
  const platforms = state.platforms.filter((platform) => !platform.archived);
  if (platformSelect) {
    if (!platforms.some((platform) => platform.key === selectedPlatformKey)) selectedPlatformKey = platforms[0]?.key || "";
    platformSelect.innerHTML = platforms.length
      ? platforms.map((platform) => `<option value="${escapeAttribute(platform.key)}">${escapeAttribute(platform.name)}</option>`).join("")
      : '<option value="">Nenhuma plataforma cadastrada</option>';
    platformSelect.value = selectedPlatformKey;
  }
  setVal("pricingProductName", product?.name || "");
  setVal("pricingProductSku", product?.sku || "");
  setVal("pricingProductCost", Number(state.pricing.productCost || 0).toFixed(2));
  setVal("pricingPackagingCost", Number(state.pricing.packagingCost || 0).toFixed(2));
  setVal("pricingExtraCost", Number(state.pricing.extraCost || 0).toFixed(2));
  setVal("pricingShippingSubsidy", Number(state.pricing.shippingSubsidy || 0).toFixed(2));
  setVal("pricingTaxRate", Number(state.pricing.taxRate || 0).toFixed(1));
  setVal("pricingReturnReserveRate", Number(state.pricing.returnReserveRate || 0).toFixed(1));
  setVal("pricingTargetMargin", Number(state.pricing.targetMargin || 0).toFixed(1));
  setVal("pricingTargetProfit", Number(state.pricing.targetProfit || 0).toFixed(2));
  setVal("pricingManualPrice", Number(state.pricing.manualPrice || 0).toFixed(2));
  document.getElementById("pricingModeMargin")?.classList.toggle("active", state.pricing.mode === "margin");
  document.getElementById("pricingModeProfit")?.classList.toggle("active", state.pricing.mode === "profit");
  const marginWrap = document.getElementById("pricingTargetMarginWrap");
  const profitWrap = document.getElementById("pricingTargetProfitWrap");
  const deleteButton = document.getElementById("pricingDeleteProduct");
  const baseCost = document.getElementById("pricingBaseCost");
  if (marginWrap) marginWrap.hidden = state.pricing.mode !== "margin";
  if (profitWrap) profitWrap.hidden = state.pricing.mode !== "profit";
  if (deleteButton) deleteButton.disabled = state.pricing.products.length <= 1;
  if (baseCost) baseCost.textContent = R(getPricingBaseCost());
  renderCards();
}

function renderCards() {
  const container = document.getElementById("pricingPlatformGrid");
  if (!container) return;
  const settingsOpen = container.querySelector("[data-pricing-settings]")?.open || false;
  const breakdownOpen = container.querySelector("[data-pricing-breakdown]")?.open || false;
  const platform = state.platforms.find((item) => item.key === selectedPlatformKey && !item.archived);
  if (!platform) {
    container.innerHTML = '<div class="empty-state">Cadastre uma plataforma para calcular o preço e as taxas.</div>';
    return;
  }
  const profile = getProfile(platform);
  const result = calculatePlatformPrice(profile);
  const tiers = getProfileFeeTiersPublic(profile);
  const issues = validateFeeTiers(profile);
  const reviewed = profile.lastReviewedAt ? `Conferida em ${escapeAttribute(formatDate(profile.lastReviewedAt))}` : "Taxas estimadas · confira os valores da sua conta";
  const sourceUrl = /^https?:\/\//i.test(profile.sourceUrl || "")
    ? `<a href="${escapeAttribute(profile.sourceUrl)}" target="_blank" rel="noopener noreferrer">Fonte das taxas</a>` : "";
  const tierMessage = issues.length
    ? `<div class="pricing-validation" role="alert">${issues.map(escapeAttribute).join("<br>")}</div>`
    : tiers.length && !result ? '<div class="pricing-validation" role="status">Nenhuma faixa cobre o preço calculado. Confira os limites e as tarifas.</div>'
      : tiers.length ? `<div class="pricing-note">Faixa aplicada: ${R(result.feeTier.min)}–${result.feeTier.max === null ? "sem limite" : R(result.feeTier.max)}.</div>` : "";
  container.innerHTML = `<article class="pricing-card pricing-selected-card" data-platform-card="${escapeAttribute(platform.key)}">
    <div class="pricing-card-head"><div><div class="pricing-platform">${platformBadge(platform)}</div><div class="pricing-source">${reviewed}${sourceUrl ? ` · ${sourceUrl}` : ""}</div></div><div class="pricing-result">${result ? R(result.idealPrice) : "Revise taxas"}<small>preço recomendado</small></div></div>
    ${result ? `<div class="pricing-quick-results"><div><span>Lucro por unidade</span><strong>${R(result.profit)}</strong></div><div><span>Margem estimada</span><strong>${result.profitMargin.toFixed(1)}%</strong></div><div><span>Valor pago pelo cliente</span><strong>${R(result.paidPrice)}</strong></div></div>` : ""}
    ${tierMessage}${renderRounding(profile, result)}${renderManual(profile)}
    <details data-pricing-breakdown ${breakdownOpen ? "open" : ""}><summary>Ver composição do preço</summary>${renderBreakdown(result) || '<p class="pricing-help">Preencha os custos e as taxas para ver a composição.</p>'}</details>
    <details data-pricing-settings ${settingsOpen ? "open" : ""}><summary>Configurar taxas de ${escapeAttribute(platform.name)}</summary>
      <div class="pricing-grid">
        <label class="fg"><span class="flabel">Comissão (%)</span><input class="finput" type="number" step="0.1" min="0" max="100" data-pricing-profile="${escapeAttribute(platform.key)}" data-field="commissionRate" value="${Number(profile.commissionRate || 0).toFixed(1)}" ${tiers.length ? "disabled" : ""}></label>
        <label class="fg"><span class="flabel">Outra taxa percentual</span><input class="finput" type="number" step="0.1" min="0" max="100" data-pricing-profile="${escapeAttribute(platform.key)}" data-field="transactionRate" value="${Number(profile.transactionRate || 0).toFixed(1)}"></label>
        <label class="fg"><span class="flabel">Tarifa fixa por pedido (R$)</span><input class="finput" type="number" step="0.01" min="0" data-pricing-profile="${escapeAttribute(platform.key)}" data-field="fixedFee" value="${Number(profile.fixedFee || 0).toFixed(2)}" ${tiers.length ? "disabled" : ""}></label>
        <label class="fg"><span class="flabel">Frete adicional (R$)</span><input class="finput" type="number" step="0.01" min="0" data-pricing-profile="${escapeAttribute(platform.key)}" data-field="extraShippingCost" value="${Number(profile.extraShippingCost || 0).toFixed(2)}"></label>
        <label class="fg"><span class="flabel">Desconto pago pela loja (%)</span><input class="finput" type="number" step="0.1" min="0" max="99.9" data-pricing-profile="${escapeAttribute(platform.key)}" data-field="sellerDiscountRate" value="${Number(profile.sellerDiscountRate || 0).toFixed(1)}"></label>
      </div>
      ${renderTiers(platform.key, tiers)}
      <div class="pricing-tier-tools"><button class="btn btn-secondary" type="button" data-pricing-tier-add="${escapeAttribute(platform.key)}">Adicionar faixa de tarifa</button><button class="btn btn-secondary" type="button" data-pricing-review="${escapeAttribute(platform.key)}">Marcar taxas como conferidas</button></div>
      <label class="fg"><span class="flabel">Observação</span><input class="finput" type="text" maxlength="200" data-pricing-profile="${escapeAttribute(platform.key)}" data-field="note" value="${escapeAttribute(profile.note || "")}"></label>
      <label class="fg"><span class="flabel">Link de referência (opcional)</span><input class="finput" type="url" maxlength="500" placeholder="https://" data-pricing-profile="${escapeAttribute(platform.key)}" data-field="sourceUrl" value="${escapeAttribute(profile.sourceUrl || "")}"></label>
    </details>
  </article>`;
}

function renderTiers(platformKey, tiers) {
  if (!tiers.length) return "";
  return `<div class="pricing-tier-list"><h3>Faixas de tarifa por valor pago</h3>${tiers.map((tier, index) => `<div class="pricing-tier-row">
    <label class="fg"><span class="flabel">Mínimo (R$)</span><input class="finput" type="number" min="0" step="0.01" data-pricing-profile="${escapeAttribute(platformKey)}" data-tier-index="${index}" data-tier-field="min" value="${Number(tier.min).toFixed(2)}"></label>
    <label class="fg"><span class="flabel">Máximo (R$, vazio = sem limite)</span><input class="finput" type="number" min="0" step="0.01" data-pricing-profile="${escapeAttribute(platformKey)}" data-tier-index="${index}" data-tier-field="max" value="${tier.max === null ? "" : Number(tier.max).toFixed(2)}"></label>
    <label class="fg"><span class="flabel">Comissão %</span><input class="finput" type="number" min="0" max="100" step="0.1" data-pricing-profile="${escapeAttribute(platformKey)}" data-tier-index="${index}" data-tier-field="commissionRate" value="${Number(tier.commissionRate).toFixed(1)}"></label>
    <label class="fg"><span class="flabel">Tarifa fixa (R$)</span><input class="finput" type="number" min="0" step="0.01" data-pricing-profile="${escapeAttribute(platformKey)}" data-tier-index="${index}" data-tier-field="fixedFee" value="${Number(tier.fixedFee).toFixed(2)}"></label>
    <button class="btn btn-secondary" type="button" aria-label="Remover faixa ${index + 1}" data-pricing-tier-remove="${escapeAttribute(platformKey)}" data-tier-index="${index}">Remover</button>
  </div>`).join("")}</div>`;
}

function renderBreakdown(result) {
  if (!result) return "";
  return `<div class="pricing-breakdown" aria-label="Composição do cálculo">
    <div><span>Desconto da loja</span><strong>−${R(result.discountValue)}</strong></div><div><span>Valor pago pelo cliente</span><strong>${R(result.paidPrice)}</strong></div>
    <div><span>Custos por unidade</span><strong>−${R(result.baseCost)}</strong></div><div><span>Taxa fixa e frete do canal</span><strong>−${R(result.fixedFee + result.shippingCost)}</strong></div>
    <div><span>Comissão e outras taxas</span><strong>−${R(result.platformFees)}</strong></div><div><span>Imposto estimado</span><strong>−${R(result.taxes)}</strong></div>
    <div><span>Reserva para devoluções</span><strong>−${R(result.returnsReserve)}</strong></div><div class="pricing-breakdown-total"><span>Lucro após os custos cadastrados</span><strong>${R(result.profit)} · margem ${result.profitMargin.toFixed(1)}%</strong></div>
  </div>`;
}

function renderManual(profile) {
  const enteredPrice = Number(state.pricing.manualPrice || 0);
  if (!enteredPrice) return "";
  const result = calculateSalePriceResult(profile, enteredPrice);
  if (!result) return '<div class="pricing-validation" role="status">O preço informado não está coberto por uma faixa de tarifa válida.</div>';
  const kind = result.profit < 0 ? "danger" : result.profitMargin < Number(state.pricing.targetMargin || 0) ? "warning" : "success";
  return `<div class="pricing-manual ${kind}"><div><span>Preço anunciado informado: ${R(result.idealPrice)}</span><strong>${R(result.profit)} de lucro estimado</strong></div><div><span>Valor pago pelo cliente</span><strong>${R(result.paidPrice)} · margem ${result.profitMargin.toFixed(1)}%</strong></div></div>`;
}

function renderRounding(profile, result) {
  if (!result) return "";
  const options = getPsychologicalPriceOptions(result.idealPrice);
  if (!options.length) return "";
  return `<div class="pricing-rounding"><span>Preços de referência que não ficam abaixo da meta calculada</span><div>${options.map((price) => {
    const sale = calculateSalePriceResult(profile, price);
    return `<button class="pricing-round-button" type="button" data-pricing-manual-price="${price.toFixed(2)}"><span>${R(price)}</span><strong>${sale ? `${sale.profitMargin.toFixed(1)}% margem` : "fora da faixa"}</strong></button>`;
  }).join("")}</div></div>`;
}

function formatDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}

function bindEvents() {
  document.getElementById("pricingPlatformSelect")?.addEventListener("change", (event) => {
    selectedPlatformKey = event.target.value;
    renderCards();
  });
  const fields = {
    pricingProductCost: "productCost", pricingPackagingCost: "packagingCost", pricingExtraCost: "extraCost",
    pricingShippingSubsidy: "shippingSubsidy", pricingTaxRate: "taxRate", pricingReturnReserveRate: "returnReserveRate",
    pricingTargetMargin: "targetMargin", pricingTargetProfit: "targetProfit", pricingManualPrice: "manualPrice"
  };
  Object.entries(fields).forEach(([id, field]) => document.getElementById(id)?.addEventListener("input", (event) => {
    state.pricing[field] = Math.max(0, Number(event.target.value || 0));
    if (field === "targetMargin") state.pricing[field] = Math.min(99, state.pricing[field]);
    if (["taxRate", "returnReserveRate"].includes(field)) state.pricing[field] = Math.min(100, state.pricing[field]);
    syncProduct(); saveState();
    const baseCost = document.getElementById("pricingBaseCost");
    if (baseCost) baseCost.textContent = R(getPricingBaseCost());
    renderCards();
  }));
  document.getElementById("pricingProductSelect")?.addEventListener("change", (event) => {
    syncProduct();
    state.pricing.activeProductId = event.target.value;
    const next = activeProduct();
    PRODUCT_FIELDS.forEach((field) => { state.pricing[field] = Number(next[field] || 0); });
    saveState(); render();
  });
  document.getElementById("pricingNewProduct")?.addEventListener("click", () => {
    const name = document.getElementById("pricingProductName").value.trim();
    if (!name) { toastError("Informe o nome do novo produto."); return; }
    syncProduct();
    const product = { id: `produto-${Date.now()}`, name: name.slice(0, 80), sku: document.getElementById("pricingProductSku").value.trim().slice(0, 40), ...Object.fromEntries(PRODUCT_FIELDS.map((field) => [field, Number(state.pricing[field] || 0)])) };
    state.pricing.products.push(product); state.pricing.activeProductId = product.id; saveState(); render(); toastSuccess("Cenário de produto criado.");
  });
  document.getElementById("pricingSaveProductDetails")?.addEventListener("click", () => {
    const product = activeProduct(); const name = document.getElementById("pricingProductName").value.trim();
    if (!name) { toastError("O nome do produto não pode ficar vazio."); return; }
    product.name = name.slice(0, 80); product.sku = document.getElementById("pricingProductSku").value.trim().slice(0, 40); saveState(); render(); toastSuccess("Produto atualizado.");
  });
  document.getElementById("pricingDeleteProduct")?.addEventListener("click", () => {
    if (state.pricing.products.length <= 1) return;
    const product = activeProduct();
    if (!window.confirm(`Excluir o cenário “${product.name}”?`)) return;
    state.pricing.products = state.pricing.products.filter((item) => item.id !== product.id);
    state.pricing.activeProductId = state.pricing.products[0].id;
    PRODUCT_FIELDS.forEach((field) => { state.pricing[field] = Number(state.pricing.products[0][field] || 0); });
    saveState(); render();
  });
  document.getElementById("pricingModeMargin")?.addEventListener("click", () => { state.pricing.mode = "margin"; saveState(); render(); });
  document.getElementById("pricingModeProfit")?.addEventListener("click", () => { state.pricing.mode = "profit"; saveState(); render(); });

  document.getElementById("pricingPlatformGrid")?.addEventListener("input", (event) => {
    const input = event.target.closest("[data-pricing-profile]"); if (!input) return;
    const key = input.dataset.pricingProfile; const platform = state.platforms.find((item) => item.key === key); if (!platform) return;
    const profile = state.pricing.profiles[key] ||= normalizePricingProfile(platform, {}, MARKETPLACE_PRICING_PRESETS);
    let updatedField = input.dataset.field;
    if (input.dataset.tierIndex !== undefined) {
      const index = Number(input.dataset.tierIndex); const field = input.dataset.tierField;
      updatedField = field;
      profile.feeTiers[index][field] = field === "max" && input.value === "" ? null : Math.max(0, Number(input.value || 0));
    } else if (["note", "sourceUrl"].includes(input.dataset.field)) profile[input.dataset.field] = input.value;
    else profile[input.dataset.field] = Math.max(0, Number(input.value || 0));
    if (["commissionRate", "transactionRate"].includes(updatedField)) profile[updatedField] = Math.min(100, Number(input.value || 0));
    if (updatedField === "sellerDiscountRate") profile[updatedField] = Math.min(99.9, Number(input.value || 0));
    if (updatedField === "commissionRate" && input.dataset.tierIndex !== undefined) profile.feeTiers[Number(input.dataset.tierIndex)].commissionRate = Math.min(100, Number(input.value || 0));
    if (input.dataset.field !== "note") profile.lastReviewedAt = "";
    profile.sourceType = "custom"; saveState();
  });
  document.getElementById("pricingPlatformGrid")?.addEventListener("change", (event) => {
    if (event.target.closest("[data-pricing-profile]")) renderCards();
  });
  document.getElementById("pricingPlatformGrid")?.addEventListener("click", (event) => {
    const review = event.target.closest("[data-pricing-review]");
    if (review) { const profile = state.pricing.profiles[review.dataset.pricingReview]; profile.lastReviewedAt = new Date().toISOString().slice(0, 10); saveState(); render(); return; }
    const remove = event.target.closest("[data-pricing-tier-remove]");
    if (remove) { const profile = state.pricing.profiles[remove.dataset.pricingTierRemove]; profile.feeTiers.splice(Number(remove.dataset.tierIndex), 1); profile.lastReviewedAt = ""; saveState(); render(); return; }
    const add = event.target.closest("[data-pricing-tier-add]");
    if (add) { const profile = state.pricing.profiles[add.dataset.pricingTierAdd]; const tiers = profile.feeTiers; const previous = tiers[tiers.length - 1]; if (previous?.max === null) { toastError("A última faixa não pode ser aberta antes de adicionar outra. Defina um máximo primeiro."); return; } const min = previous ? Number((previous.max + 0.01).toFixed(2)) : 0; tiers.push({ min, max: null, commissionRate: previous?.commissionRate || profile.commissionRate || 0, fixedFee: previous?.fixedFee || profile.fixedFee || 0 }); profile.lastReviewedAt = ""; saveState(); render(); return; }
    const manual = event.target.closest("[data-pricing-manual-price]");
    if (manual) { state.pricing.manualPrice = Number(manual.dataset.pricingManualPrice); syncProduct(); saveState(); render(); }
  });
}
