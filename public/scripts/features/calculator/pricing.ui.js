import { state, saveState, normalizePricingProfile } from "../../core/state.js";
import { R, escapeAttribute } from "../../core/format.js";
import { MARKETPLACE_PRICING_PRESETS } from "../../core/constants.js";
import { platformBadge } from "../../ui/icons.js";
import { toastSuccess } from "../../ui/toast.js";
import {
  calculatePlatformPrice, calculateSalePriceResult,
  getPricingBaseCost, getPsychologicalPriceOptions,
  getProfileFeeTiersPublic
} from "./pricing.calc.js";

let bound = false;

export function init() {
  render();
  if (!bound) { bindEvents(); bound = true; }
}

function getProfile(p) {
  return state.pricing.profiles[p.key] || normalizePricingProfile(p, {}, MARKETPLACE_PRICING_PRESETS);
}

function render() {
  const ct = document.getElementById("calculatorTitle");
  if (ct) ct.textContent = `Calculadora de ${state.platforms.length} Plataforma${state.platforms.length > 1 ? "s" : ""}`;

  document.getElementById("pricingModeMargin")?.classList.toggle("active", state.pricing.mode === "margin");
  document.getElementById("pricingModeProfit")?.classList.toggle("active", state.pricing.mode === "profit");

  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  setVal("pricingProductCost", Number(state.pricing.productCost || 0).toFixed(2));
  setVal("pricingPackagingCost", Number(state.pricing.packagingCost || 0).toFixed(2));
  setVal("pricingExtraCost", Number(state.pricing.extraCost || 0).toFixed(2));
  setVal("pricingShippingSubsidy", Number(state.pricing.shippingSubsidy || 0).toFixed(2));
  setVal("pricingTargetMargin", Number(state.pricing.targetMargin || 0).toFixed(1));
  setVal("pricingTargetProfit", Number(state.pricing.targetProfit || 0).toFixed(2));
  setVal("pricingManualPrice", Number(state.pricing.manualPrice || 0).toFixed(2));

  const mw = document.getElementById("pricingTargetMarginWrap");
  const pw = document.getElementById("pricingTargetProfitWrap");
  if (mw) mw.hidden = state.pricing.mode !== "margin";
  if (pw) pw.hidden = state.pricing.mode !== "profit";

  const bc = document.getElementById("pricingBaseCost");
  if (bc) bc.textContent = R(getPricingBaseCost());

  renderCards();
}

function renderCards() {
  const c = document.getElementById("pricingPlatformGrid");
  if (!c) return;

  c.innerHTML = state.platforms.map((p) => {
    const profile = getProfile(p);
    const r = calculatePlatformPrice(profile);
    const ft = getProfileFeeTiersPublic(profile);
    const hft = ft.length > 0;
    const src = profile.sourceType === "official" ? "Taxa base pública"
      : profile.sourceType === "estimated" ? "Taxa inicial estimada" : "Taxa personalizada";
    const cv = r ? r.commissionRate : Number(profile.commissionRate || 0);
    const fv = r ? r.fixedFee : Number(profile.fixedFee || 0);

    const tn = hft && r?.feeTier
      ? `<div class="pricing-note">Faixa aplicada: ${R(r.feeTier.min)} a ${r.feeTier.max === null ? "sem limite" : R(r.feeTier.max)} - ${r.feeTier.commissionRate.toFixed(1)}% + ${R(r.feeTier.fixedFee)}.</div>`
      : "";

    return `
      <article class="pricing-card">
        <div class="pricing-card-head">
          <div><div class="pricing-platform">${platformBadge(p)}</div><div class="pricing-source">${src}</div></div>
          <div class="pricing-result">${r ? R(r.idealPrice) : "Revise taxas"}</div>
        </div>
        <div class="pricing-grid">
          <label class="fg"><span class="flabel">Comissão %</span><input class="finput" type="number" step="0.1" min="0" data-pricing-profile="${escapeAttribute(p.key)}" data-field="commissionRate" value="${Number(cv || 0).toFixed(1)}" ${hft ? "disabled" : ""}></label>
          <label class="fg"><span class="flabel">Taxa Extra %</span><input class="finput" type="number" step="0.1" min="0" data-pricing-profile="${escapeAttribute(p.key)}" data-field="transactionRate" value="${Number(profile.transactionRate || 0).toFixed(1)}"></label>
          <label class="fg"><span class="flabel">Taxa Fixa R$</span><input class="finput" type="number" step="0.01" min="0" data-pricing-profile="${escapeAttribute(p.key)}" data-field="fixedFee" value="${Number(fv || 0).toFixed(2)}" ${hft ? "disabled" : ""}></label>
          <label class="fg"><span class="flabel">Frete Repasse R$</span><input class="finput" type="number" step="0.01" min="0" data-pricing-profile="${escapeAttribute(p.key)}" data-field="extraShippingCost" value="${Number(profile.extraShippingCost || 0).toFixed(2)}"></label>
        </div>
        ${tn}
        ${renderBreakdown(r)}
        ${renderManual(profile)}
        ${renderRounding(p.key, profile, r)}
        <div class="pricing-note">${profile.note || "Revise os custos dessa plataforma antes de usar o valor em produção."}</div>
        <div class="pricing-kpis">
          <div><span>Taxas variáveis</span><strong>${r ? R(r.variableFees) : "-"}</strong></div>
          <div><span>Lucro estimado</span><strong>${r ? R(r.profit) : "-"}</strong></div>
          <div><span>Margem final</span><strong>${r ? `${r.profitMargin.toFixed(1)}%` : "-"}</strong></div>
        </div>
      </article>
    `;
  }).join("");
}

function renderBreakdown(r) {
  if (!r) return "";
  const ft = Number(r.baseCost || 0) + Number(r.fixedFee || 0) + Number(r.shippingCost || 0);
  return `
    <div class="pricing-breakdown">
      <div><span>Custo base</span><strong>${R(r.baseCost)}</strong></div>
      <div><span>Taxa fixa</span><strong>${R(r.fixedFee)}</strong></div>
      <div><span>Frete repasse</span><strong>${R(r.shippingCost)}</strong></div>
      <div><span>Taxas variáveis</span><strong>${R(r.variableFees)}</strong></div>
      <div><span>Lucro</span><strong>${R(r.profit)}</strong></div>
      <div><span>Total</span><strong>${R(r.idealPrice)}</strong></div>
      <div class="pricing-breakdown-total"><span>Composição</span><strong>${R(ft)} + ${R(r.variableFees)} + ${R(r.profit)}</strong></div>
    </div>
  `;
}

function renderManual(profile) {
  const mr = calculateSalePriceResult(profile, state.pricing.manualPrice);
  if (!mr) return "";
  const sc = mr.profit < 0 ? "danger" : mr.profitMargin < 10 ? "warning" : "success";
  return `
    <div class="pricing-manual ${sc}">
      <div><span>Vendendo por ${R(mr.idealPrice)}</span><strong>${R(mr.profit)} de lucro</strong></div>
      <div><span>Margem real</span><strong>${mr.profitMargin.toFixed(1)}%</strong></div>
    </div>
  `;
}

function renderRounding(pk, profile, r) {
  if (!r) return "";
  const opts = getPsychologicalPriceOptions(r.idealPrice);
  if (!opts.length) return "";
  const btns = opts.map((p) => {
    const rd = calculateSalePriceResult(profile, p);
    return `<button class="pricing-round-button" type="button" data-pricing-manual-price="${p.toFixed(2)}"><span>${R(p)}</span><strong>${rd ? `${rd.profitMargin.toFixed(1)}%` : "-"}</strong></button>`;
  }).join("");
  return `<div class="pricing-rounding" data-platform-key="${escapeAttribute(pk)}"><span>Arredondar e testar margem</span><div>${btns}</div></div>`;
}

function bindEvents() {
  const fields = {
    pricingProductCost: "productCost", pricingPackagingCost: "packagingCost",
    pricingExtraCost: "extraCost", pricingShippingSubsidy: "shippingSubsidy",
    pricingTargetMargin: "targetMargin", pricingTargetProfit: "targetProfit",
    pricingManualPrice: "manualPrice"
  };

  Object.entries(fields).forEach(([id, field]) => {
    document.getElementById(id)?.addEventListener("input", (e) => {
      state.pricing[field] = Number(e.target.value || 0);
      saveState();
      render();
      restoreFocus();
    });
  });

  document.getElementById("pricingModeMargin")?.addEventListener("click", () => {
    state.pricing.mode = "margin";
    saveState();
    render();
  });
  document.getElementById("pricingModeProfit")?.addEventListener("click", () => {
    state.pricing.mode = "profit";
    saveState();
    render();
  });

  document.getElementById("pricingPlatformGrid")?.addEventListener("input", (e) => {
    const input = e.target.closest("[data-pricing-profile]");
    if (!input) return;
    const pk = input.dataset.pricingProfile;
    const field = input.dataset.field;
    const p = state.platforms.find((x) => x.key === pk);
    if (!p) return;
    if (!state.pricing.profiles[pk]) state.pricing.profiles[pk] = normalizePricingProfile(p, {}, MARKETPLACE_PRICING_PRESETS);
    state.pricing.profiles[pk][field] = Number(input.value || 0);
    state.pricing.profiles[pk].sourceType = "custom";
    saveState();
    render();
    restoreFocus();
  });

  document.getElementById("pricingPlatformGrid")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pricing-manual-price]");
    if (!btn) return;
    state.pricing.manualPrice = Number(btn.dataset.pricingManualPrice);
    saveState();
    render();
  });
}

function restoreFocus() {
  const active = document.activeElement;
  if (!active) return;
  const id = active.id || `${active.dataset?.pricingProfile}_${active.dataset?.field}`;
  requestAnimationFrame(() => {
    const next = document.getElementById(id)
      || document.querySelector(`[data-pricing-profile="${active.dataset?.pricingProfile}"][data-field="${active.dataset?.field}"]`);
    if (next && !next.disabled) {
      next.focus();
      const len = next.value.length;
      next.setSelectionRange?.(len, len);
    }
  });
}