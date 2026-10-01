import { state } from "../../core/state.js";
import { MARKETPLACE_PRICING_PRESETS } from "../../core/constants.js";

export function getPricingBaseCost() {
  return Number(state.pricing.productCost || 0)
    + Number(state.pricing.packagingCost || 0)
    + Number(state.pricing.extraCost || 0)
    + Number(state.pricing.shippingSubsidy || 0);
}

function getProfileFeeTiers(profile) {
  if (!Array.isArray(profile?.feeTiers)) return [];
  return profile.feeTiers
    .map((t) => ({
      min: Number(t.min ?? 0),
      max: t.max === null || t.max === undefined || t.max === "" ? null : Number(t.max),
      commissionRate: Number(t.commissionRate || 0),
      fixedFee: Number(t.fixedFee || 0)
    }))
    .filter((t) => Number.isFinite(t.min) && (t.max === null || Number.isFinite(t.max)) && Number.isFinite(t.commissionRate) && Number.isFinite(t.fixedFee))
    .sort((a, b) => a.min - b.min);
}

export function validateFeeTiers(profile) {
  const tiers = getProfileFeeTiers(profile);
  const errors = [];
  if (Array.isArray(profile?.feeTiers) && profile.feeTiers.length && !tiers.length) errors.push("Adicione pelo menos uma faixa de tarifa válida.");
  tiers.forEach((tier, index) => {
    if (tier.min < 0 || (tier.max !== null && tier.max < tier.min)) errors.push(`Faixa ${index + 1}: confira os limites de preço.`);
    if (tier.commissionRate < 0 || tier.fixedFee < 0) errors.push(`Faixa ${index + 1}: taxas não podem ser negativas.`);
    const previous = tiers[index - 1];
    if (previous?.max === null) errors.push(`Faixa ${index}: limite máximo aberto precisa ser a última faixa.`);
    else if (previous && tier.min <= previous.max) errors.push(`Faixa ${index + 1}: há sobreposição com a faixa anterior.`);
  });
  return errors;
}

function isPriceInTier(price, tier) {
  return price >= Number(tier.min || 0) && (tier.max === null || price <= Number(tier.max));
}

function getFeeConfigForPrice(profile, price) {
  const ft = getProfileFeeTiers(profile);
  if (!ft.length) return { commissionRate: Number(profile.commissionRate || 0), fixedFee: Number(profile.fixedFee || 0), feeTier: null };
  const t = ft.find((tier) => isPriceInTier(price, tier));
  if (!t) return null;
  return { commissionRate: Number(t.commissionRate || 0), fixedFee: Number(t.fixedFee || 0), feeTier: t };
}

function getVariableRates(profile) {
  return {
    platform: (Number(profile.commissionRate || 0) + Number(profile.transactionRate || 0)) / 100,
    tax: Number(state.pricing.taxRate || 0) / 100,
    returns: Number(state.pricing.returnReserveRate || 0) / 100,
    discount: Number(profile.sellerDiscountRate || 0) / 100
  };
}

function calculatePriceWithFeeConfig(profile, fc) {
  const rates = getVariableRates({ ...profile, commissionRate: fc.commissionRate });
  const vr = rates.platform + rates.tax + rates.returns;
  const bc = getPricingBaseCost();
  const ff = Number(fc.fixedFee || 0);
  const sc = Number(profile.extraShippingCost || 0);
  const fcst = bc + ff + sc;
  const tmr = Math.min(99, Math.max(0, Number(state.pricing.targetMargin || 0))) / 100;

  let ip = 0;
  if (state.pricing.mode === "profit") {
    const d = 1 - vr;
    if (d <= 0) return null;
    ip = (fcst + Number(state.pricing.targetProfit || 0)) / ((1 - rates.discount) * d);
  } else {
    const d = 1 - vr - tmr;
    if (d <= 0) return null;
    ip = fcst / ((1 - rates.discount) * d);
  }

  const paidPrice = ip * (1 - rates.discount);
  const platformFees = paidPrice * rates.platform;
  const taxes = paidPrice * rates.tax;
  const returnsReserve = paidPrice * rates.returns;
  const profit = paidPrice - platformFees - taxes - returnsReserve - fcst;
  return {
    idealPrice: ip, paidPrice, discountValue: ip - paidPrice,
    variableFees: platformFees, platformFees, taxes, returnsReserve,
    fixedFee: ff, shippingCost: sc, baseCost: bc,
    commissionRate: Number(fc.commissionRate || 0),
    transactionRate: Number(profile.transactionRate || 0),
    profit, profitMargin: paidPrice > 0 ? (profit / paidPrice) * 100 : 0
  };
}

export function calculatePlatformPrice(profile) {
  const ft = getProfileFeeTiers(profile);
  if (validateFeeTiers(profile).length) return null;
  if (!ft.length) return calculatePriceWithFeeConfig(profile, {
    commissionRate: Number(profile.commissionRate || 0),
    fixedFee: Number(profile.fixedFee || 0)
  });
  for (const tier of ft) {
    const r = calculatePriceWithFeeConfig(profile, tier);
    if (r && isPriceInTier(r.paidPrice, tier)) return { ...r, feeTier: tier };
  }
  return null;
}

export function calculateSalePriceResult(profile, sp) {
  const p = Number(sp || 0);
  if (p <= 0) return null;
  if (validateFeeTiers(profile).length) return null;
  const rates = getVariableRates(profile);
  const paidPrice = p * (1 - rates.discount);
  const fc = getFeeConfigForPrice(profile, paidPrice);
  if (!fc) return null;
  rates.platform = (Number(fc.commissionRate || 0) + Number(profile.transactionRate || 0)) / 100;
  const bc = getPricingBaseCost();
  const ff = Number(fc.fixedFee || 0);
  const sc = Number(profile.extraShippingCost || 0);
  const fcst = bc + ff + sc;
  const platformFees = paidPrice * rates.platform;
  const taxes = paidPrice * rates.tax;
  const returnsReserve = paidPrice * rates.returns;
  const profit = paidPrice - platformFees - taxes - returnsReserve - fcst;
  return {
    idealPrice: p, paidPrice, discountValue: p - paidPrice,
    variableFees: platformFees, platformFees, taxes, returnsReserve,
    fixedFee: ff, shippingCost: sc, baseCost: bc,
    commissionRate: Number(fc.commissionRate || 0),
    transactionRate: Number(profile.transactionRate || 0),
    profit, profitMargin: paidPrice > 0 ? (profit / paidPrice) * 100 : 0,
    feeTier: fc.feeTier
  };
}

export function getPsychologicalPriceOptions(price) {
  const v = Number(price || 0);
  if (v <= 0) return [];
  const bases = [Math.ceil(v), Math.ceil(v) + 0.9, Math.ceil(v) + 1.9];
  return [...new Set(bases.filter((o) => o > 0).map((o) => Number(o.toFixed(2))).filter((o) => o >= v).sort((a, b) => a - b))].slice(0, 3);
}

export function getProfileFeeTiersPublic(profile) {
  return getProfileFeeTiers(profile);
}
