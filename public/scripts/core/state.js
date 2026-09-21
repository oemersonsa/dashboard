import {
  STORAGE_KEY, STORAGE_BACKUP_KEY, AUTH_STORAGE_KEY, LAST_SAVED_KEY,
  ALL_MONTHS, BRAND_COLORS, LEGACY_PLATFORM_PRESETS,
  LEGACY_PLATFORM_KEY_ALIASES, PRICING_DEFAULTS
} from "./constants.js";
import { slugify, formatSavedAt } from "./format.js";
import { apiRequest, loadSession, saveSession, clearSession } from "./api.js";

function clone(v) { return JSON.parse(JSON.stringify(v)); }

export const state = loadState();

function getDefaultMonth() { return ALL_MONTHS[new Date().getMonth()]; }
function getCurrentYear() { return new Date().getFullYear(); }

export function formatPeriodKey(month, year = getCurrentYear()) {
  return `${year}-${normalizeMonthName(month)}`;
}

export function parsePeriodKey(period) {
  const raw = String(period || "").trim();
  const fallbackMonth = getDefaultMonth();
  const fallbackYear = getCurrentYear();
  if (!raw) return { year: fallbackYear, month: fallbackMonth, key: formatPeriodKey(fallbackMonth, fallbackYear) };
  const yf = raw.match(/^(\d{4})[-_\s/]+(.+)$/);
  const yl = raw.match(/^(.+?)[-_\s/]+(\d{4})$/);
  const year = Number(yf?.[1] || yl?.[2] || fallbackYear);
  const monthPart = yf?.[2] || yl?.[1] || raw;
  const month = normalizeMonthName(monthPart);
  return { year, month, key: formatPeriodKey(month, year) };
}

export function normalizePeriodKey(p) { return parsePeriodKey(p).key; }
export function getPeriodMonth(p) { return parsePeriodKey(p).month; }
export function getPeriodYear(p) { return parsePeriodKey(p).year; }
export function getPeriodLabel(p) {
  const x = parsePeriodKey(p);
  return `${x.month} ${x.year}`;
}

export function sortPeriodKeys(periods) {
  return [...periods].sort((a, b) => {
    const pa = parsePeriodKey(a);
    const pb = parsePeriodKey(b);
    if (pa.year !== pb.year) return pa.year - pb.year;
    return ALL_MONTHS.indexOf(pa.month) - ALL_MONTHS.indexOf(pb.month);
  });
}

export function normalizeMonthName(month) {
  const raw = String(month || "").trim();
  if (!raw) return getDefaultMonth();
  const normalized = raw
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "").toLowerCase();
  const matched = ALL_MONTHS.find((m) =>
    m.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === normalized
  );
  return matched || raw || getDefaultMonth();
}

export function slugifyText(value) { return slugify(value); }

export function canonicalizePlatformKey(value) {
  const n = slugify(value);
  return LEGACY_PLATFORM_KEY_ALIASES[n] || n;
}

export function getPlatformKeyCandidates(platformOrKey) {
  const rawKey = typeof platformOrKey === "string" ? platformOrKey : platformOrKey?.key;
  const rawName = typeof platformOrKey === "string" ? "" : platformOrKey?.name;
  const canonicalKey = canonicalizePlatformKey(rawKey || rawName);
  const candidates = new Set([canonicalKey]);
  Object.entries(LEGACY_PLATFORM_KEY_ALIASES).forEach(([alias, target]) => {
    if (target === canonicalKey) candidates.add(alias);
  });
  const nName = slugify(rawName);
  if (nName) candidates.add(nName);
  return [...candidates].filter(Boolean);
}

export function normalizePlatform(platform = {}, index = 0) {
  const name = String(platform.name || "").trim();
  const short = String(platform.icon || platform.short || name.slice(0, 2) || `P${index + 1}`)
    .trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
  const nc = String(platform.color || "").trim();
  const color = /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(nc)
    ? nc : BRAND_COLORS[index % BRAND_COLORS.length];
  return {
    key: String(canonicalizePlatformKey(platform.key || name || `plataforma-${index + 1}`)).slice(0, 30) || `plataforma-${index + 1}`,
    name: name || `Plataforma ${index + 1}`,
    color, icon: short || `P${index + 1}`,
    iconText: platform.iconText || "#ffffff"
  };
}

function inferPlatformsFromLegacyData(data) {
  const keySet = new Set();
  Object.values(data || {}).forEach((md) => {
    (md?.days || []).forEach((day) => {
      Object.keys(day || {}).forEach((key) => { if (key !== "d") keySet.add(key); });
    });
    Object.keys(md?.returns || {}).forEach((key) => keySet.add(key));
  });
  return [...keySet].map((key, i) => {
    const preset = LEGACY_PLATFORM_PRESETS[key] || {};
    return normalizePlatform({
      key, name: preset.name || key.toUpperCase(),
      icon: preset.icon || key.toUpperCase().slice(0, 2),
      color: preset.color || BRAND_COLORS[i % BRAND_COLORS.length],
      iconText: preset.iconText || "#ffffff"
    }, i);
  });
}

export function defaultState() {
  return {
    auth: null, platforms: [], db: {},
    currentMonth: formatPeriodKey(getDefaultMonth(), getCurrentYear()),
    pricing: clone(PRICING_DEFAULTS), currentScreen: "hub"
  };
}

function normalizeAuth(auth) {
  const username = String(auth?.username || "").trim();
  if (!username) return null;
  const provider = auth?.provider === "google" ? "local" : (auth?.provider || "local");
  return { provider, username, password: String(auth.password || "") };
}

export function normalizePricingProfile(platform, profile = {}, presetMap) {
  const preset = presetMap[slugify(platform?.name)] || {};
  const isCustom = profile.sourceType === "custom";
  const source = isCustom ? profile : { ...profile, ...preset };
  return {
    commissionRate: Number(source.commissionRate ?? 0),
    transactionRate: Number(source.transactionRate ?? 0),
    fixedFee: Number(source.fixedFee ?? 0),
    extraShippingCost: Number(source.extraShippingCost ?? 0),
    feeTiers: normalizeFeeTiers(source.feeTiers),
    sourceType: String(source.sourceType || "custom"),
    note: String(source.note || "Personalize com os custos reais da sua operação.")
  };
}

function normalizeFeeTiers(tiers = []) {
  if (!Array.isArray(tiers)) return [];
  return tiers.map((t) => ({
    min: Number(t.min ?? 0),
    max: t.max === null || t.max === undefined || t.max === "" ? null : Number(t.max),
    commissionRate: Number(t.commissionRate || 0),
    fixedFee: Number(t.fixedFee || 0)
  })).filter((t) => Number.isFinite(t.min) && Number.isFinite(t.commissionRate) && Number.isFinite(t.fixedFee))
    .sort((a, b) => a.min - b.min);
}

export function normalizePricing(pricing = {}, platforms, presetMap) {
  const next = {
    productCost: Number(pricing.productCost || 0),
    packagingCost: Number(pricing.packagingCost || 0),
    extraCost: Number(pricing.extraCost || 0),
    shippingSubsidy: Number(pricing.shippingSubsidy || 0),
    targetMargin: Number(pricing.targetMargin || 0),
    targetProfit: Number(pricing.targetProfit || 0),
    manualPrice: Number(pricing.manualPrice || 0),
    mode: pricing.mode === "profit" ? "profit" : "margin",
    profiles: {}
  };
  platforms.forEach((p) => {
    next.profiles[p.key] = normalizePricingProfile(p, pricing.profiles?.[p.key] || {}, presetMap);
  });
  return next;
}

export function normalizeDay(day = {}, platforms) {
  const n = { d: day.d || "" };
  const legacyOrders = Math.max(0, Math.round(Number(day.orders ?? day.pedidos ?? 0)));
  const hasAnyPO = platforms.some((p) => getPlatformKeyCandidates(p).some((c) => Number(day[`orders_${c}`] || 0) > 0));
  const firstActive = platforms.find((p) => getPlatformKeyCandidates(p).some((c) => Number(day[c] || 0) > 0)) || platforms[0];
  platforms.forEach((p) => {
    const kc = getPlatformKeyCandidates(p);
    n[p.key] = kc.reduce((s, c) => s + Number(day[c] || 0), 0);
    const ok = `orders_${p.key}`;
    let ov = kc.reduce((s, c) => s + Math.max(0, Math.round(Number(day[`orders_${c}`] || 0))), 0);
    if (!hasAnyPO && legacyOrders > 0 && firstActive && p.key === firstActive.key) ov = legacyOrders;
    n[ok] = ov;
  });
  return n;
}

function sortDays(days) {
  return [...days].sort((a, b) => {
    const [da, ma] = (a.d || "").split("/").map(Number);
    const [db, mb] = (b.d || "").split("/").map(Number);
    if (ma !== mb) return ma - mb;
    return da - db;
  });
}

export function normalizeMonthData(monthData = {}, platforms) {
  const raw = Array.isArray(monthData.days) ? monthData.days : [];
  const days = raw.map((d) => normalizeDay(d, platforms));
  const returns = {};
  platforms.forEach((p) => {
    const kc = getPlatformKeyCandidates(p);
    returns[p.key] = kc.reduce((s, c) => s + Number((monthData.returns || {})[c] || 0), 0);
  });
  return { days: sortDays(days), returns };
}

export function normalizeState(raw, presetMap) {
  const base = defaultState();
  const rawDb = raw?.db || {};
  const npl = Array.isArray(raw?.platforms) && raw.platforms.length
    ? raw.platforms.map((p, i) => normalizePlatform(p, i))
    : inferPlatformsFromLegacyData(rawDb);
  const next = {
    auth: normalizeAuth(raw?.auth),
    platforms: npl, db: {},
    currentMonth: normalizePeriodKey(raw?.currentMonth || base.currentMonth),
    pricing: clone(PRICING_DEFAULTS),
    currentScreen: raw?.currentScreen || "hub"
  };
  Object.keys(rawDb).forEach((m) => {
    const nm = normalizePeriodKey(m);
    next.db[nm] = rawDb[m];
  });
  if (!next.platforms.length && !Object.keys(next.db).length) {
    next.db = {};
  } else {
    Object.keys(next.db).forEach((m) => {
      next.db[m] = normalizeMonthData(next.db[m], next.platforms);
    });
    if (!next.db[next.currentMonth]) {
      const months = sortPeriodKeys(Object.keys(next.db));
      next.currentMonth = months[months.length - 1] || base.currentMonth;
    }
  }
  next.pricing = normalizePricing(raw?.pricing || base.pricing, next.platforms, presetMap);
  return next;
}

function loadState() {
  try {
    const authRaw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (authRaw) {
      const parsed = JSON.parse(authRaw);
      const next = defaultState();
      next.auth = normalizeAuth(parsed.auth);
      next.currentScreen = parsed.currentScreen || "hub";
      return next;
    }
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
      || localStorage.getItem(STORAGE_KEY)
      || localStorage.getItem(STORAGE_BACKUP_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch (e) {
    console.error("Falha ao carregar state:", e);
    return defaultState();
  }
}

export function saveState(options = {}) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
    auth: state.auth, currentScreen: state.currentScreen
  }));
  localStorage.setItem(LAST_SAVED_KEY, new Date().toISOString());
  if (!options.localOnly) {
    window.dispatchEvent(new CustomEvent("dashboard:save-request"));
  }
}

export function getBusinessSnapshot() {
  return {
    platforms: state.platforms,
    db: state.db,
    currentMonth: state.currentMonth,
    currentScreen: state.currentScreen,
    pricing: state.pricing
  };
}

export function loadLastSavedAt() { return localStorage.getItem(LAST_SAVED_KEY) || ""; }
export { formatSavedAt };