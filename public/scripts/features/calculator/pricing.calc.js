import { state } from "../../core/state.js";
import { MARKETPLACE_PRICING_PRESETS } from "../../core/constants.js";
import { slugify } from "../../core/format.js";

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
    .filter((t) => Number.isFinite(t.min) && Number.isFinite(t.commissionRate) && Number.isFinite(t.fixedFee))
    .sort((a, b) => a.min - b.min);
}

function isPriceInTier(price, tier) {
  return price >= Number(tier.min || 0) && (tier.max === null || price <= Number(tier.max));
}

function getFeeConfigForPrice(profile, price) {
  const ft = getProfileFeeTiers(profile);
  if (!ft.length) return { commissionRate: Number(profile.commissionRate || 0), fixedFee: Number(profile.fixedFee || 0), feeTier: null };
  const t = ft.find((tier) => isPriceInTier(price, tier)) || ft[ft.length - 1];
  return { commissionRate: Number(t.commissionRate || 0), fixedFee: Number(t.fixedFee || 0), feeTier: t };
}

function calculatePriceWithFeeConfig(profile, fc) {
  const vr = (Number(fc.commissionRate || 0) + Number(profile.transactionRate || 0)) / 100;
  const bc = getPricingBaseCost();
  const ff = Number(fc.fixedFee || 0);
  const sc = Number(profile.extraShippingCost || 0);
  const fcst = bc + ff + sc;
  const tmr = Number(state.pricing.targetMargin || 0) / 100;

  let ip = 0;
  if (state.pricing.mode === "profit") {
    const d = 1 - vr;
    if (d <= 0) return null;
    ip = (fcst + Number(state.pricing.targetProfit || 0)) / d;
  } else {
    const d = 1 - vr - tmr;
    if (d <= 0) return null;
    ip = fcst / d;
  }

  const vf = ip * vr;
  const profit = ip - vf - fcst;
  return {
    idealPrice: ip, variableFees: vf, fixedFee: ff, shippingCost: sc, baseCost: bc,
    commissionRate: Number(fc.commissionRate || 0),
    transactionRate: Number(profile.transactionRate || 0),
    profit, profitMargin: ip > 0 ? (profit / ip) * 100 : 0
  };
}

export function calculatePlatformPrice(profile) {
  const ft = getProfileFeeTiers(profile);
  if (!ft.length) return calculatePriceWithFeeConfig(profile, {
    commissionRate: Number(profile.commissionRate || 0),
    fixedFee: Number(profile.fixedFee || 0)
  });
  for (const tier of ft) {
    const r = calculatePriceWithFeeConfig(profile, tier);
    if (r && isPriceInTier(r.idealPrice, tier)) return { ...r, feeTier: tier };
  }
  return null;
}

export function calculateSalePriceResult(profile, sp) {
  const p = Number(sp || 0);
  if (p <= 0) return null;
  const fc = getFeeConfigForPrice(profile, p);
  const vr = (Number(fc.commissionRate || 0) + Number(profile.transactionRate || 0)) / 100;
  const bc = getPricingBaseCost();
  const ff = Number(fc.fixedFee || 0);
  const sc = Number(profile.extraShippingCost || 0);
  const fcst = bc + ff + sc;
  const vf = p * vr;
  const profit = p - vf - fcst;
  return {
    idealPrice: p, variableFees: vf, fixedFee: ff, shippingCost: sc, baseCost: bc,
    commissionRate: Number(fc.commissionRate || 0),
    transactionRate: Number(profile.transactionRate || 0),
    profit, profitMargin: p > 0 ? (profit / p) * 100 : 0,
    feeTier: fc.feeTier
  };
}

export function getPsychologicalPriceOptions(price) {
  const v = Number(price || 0);
  if (v <= 0) return [];
  const bases = [Math.ceil(v), Math.ceil(v) - 0.01, Math.floor(v) + 0.9];
  return [...new Set(bases.filter((o) => o > 0).map((o) => Number(o.toFixed(2))).filter((o) => o >= v * 0.96).sort((a, b) => a - b))].slice(0, 3);
}

export function getProfileFeeTiersPublic(profile) {
  return getProfileFeeTiers(profile);
}