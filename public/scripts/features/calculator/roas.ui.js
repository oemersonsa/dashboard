import { state, normalizePricingProfile } from "../../core/state.js";
import { MARKETPLACE_PRICING_PRESETS } from "../../core/constants.js";
import { R, escapeAttribute } from "../../core/format.js";

let bound = false;

export function init() {
  const firstOpen = !bound;
  renderPlatforms();
  if (!bound) {
    document.getElementById("roasPlatform")?.addEventListener("change", () => syncProfile(true));
    document.getElementById("roasManualFees")?.addEventListener("change", () => syncProfile(true));
    document.querySelector(".roas-card")?.addEventListener("input", (event) => {
      if (event.target.id === "roasPrice") syncProfile(true);
      else if (event.target.id !== "roasPlatform") calculate();
    });
    bound = true;
  }
  syncProfile(firstOpen);
}

function renderPlatforms() {
  const select = document.getElementById("roasPlatform");
  if (!select) return;
  const platforms = state.platforms.filter((platform) => !platform.archived);
  const current = select.value;
  select.innerHTML = platforms.length
    ? platforms.map((platform) => `<option value="${escapeAttribute(platform.key)}">${escapeAttribute(platform.name)}</option>`).join("")
    : '<option value="">Nenhuma plataforma cadastrada</option>';
  if (platforms.some((platform) => platform.key === current)) select.value = current;
}

function selectedPlatform() {
  const key = document.getElementById("roasPlatform")?.value;
  return state.platforms.find((platform) => platform.key === key && !platform.archived);
}

function profileFor(platform) {
  return platform
    ? state.pricing?.profiles?.[platform.key] || normalizePricingProfile(platform, {}, MARKETPLACE_PRICING_PRESETS)
    : {};
}

function syncProfile(updateFields) {
  const platform = selectedPlatform();
  const profile = profileFor(platform);
  const manual = Boolean(document.getElementById("roasManualFees")?.checked);
  const tier = (profile.feeTiers || []).find(item => {
    const price = Number(document.getElementById("roasPrice")?.value || 0);
    return price >= Number(item.min || 0) && (item.max == null || price <= Number(item.max));
  });
  for (const id of ["roasCommission", "roasFixed"]) document.getElementById(id).readOnly = !manual && Boolean(platform);
  const note = document.getElementById("roasProfileNote");
  if (note) {
    note.textContent = platform ? (manual ? "Taxas informadas manualmente." : tier ? `Faixa: ${R(tier.min)} a ${tier.max == null ? "sem limite" : R(tier.max)} · Taxas do perfil selecionado` : "Taxas do perfil da plataforma selecionada.") : "Cadastre uma plataforma para carregar suas taxas.";
    note.title = `Revisão: ${profile.lastReviewedAt || "não informada"}. ${profile.note || ""}`;
  }
  if (updateFields && !manual) {
    document.getElementById("roasCommission").value = Number(tier?.commissionRate ?? profile.commissionRate ?? 0);
    document.getElementById("roasFixed").value = Number(tier?.fixedFee ?? profile.fixedFee ?? 0);
  }
  calculate();
}

function value(id) {
  const number = Number(document.getElementById(id)?.value || 0);
  return Number.isFinite(number) ? number : 0;
}

function calculate() {
  const price = value("roasPrice");
  const cost = value("roasCost");
  const commission = value("roasCommission") + Number(profileFor(selectedPlatform()).transactionRate || 0);
  const fixed = value("roasFixed");
  const tax = value("roasTax");
  const other = value("roasOther") + Number(profileFor(selectedPlatform()).extraShippingCost || 0);
  const margin = value("roasMargin");
  const contribution = price * (1 - (commission + tax) / 100) - cost - fixed - other;
  const budget = contribution - price * margin / 100;
  const targetRoas = budget > 0 ? price / budget : null;
  const breakEvenRoas = contribution > 0 ? price / contribution : null;

  document.getElementById("roasMarginValue").textContent = `${Math.round(margin)}%`;
  document.getElementById("roasContribution").textContent = R(contribution);
  document.getElementById("roasContributionPercent").textContent = `${price > 0 ? (contribution / price * 100).toFixed(1).replace(".", ",") : "0,0"}% do preço`;
  document.getElementById("roasAdBudget").textContent = R(Math.max(0, budget));
  document.getElementById("roasTarget").textContent = targetRoas ? `${targetRoas.toFixed(2)}x` : "Meta não atingível";
  document.getElementById("roasBreakEvenValue").textContent = breakEvenRoas ? `${breakEvenRoas.toFixed(2)}x` : "—";
  document.getElementById("roasBreakEven").textContent = `ROAS de equilíbrio matemático: ${breakEvenRoas ? `${breakEvenRoas.toFixed(2)}x` : "—"}. O ponto de equilíbrio considera a contribuição antes de anúncios.`;
}
