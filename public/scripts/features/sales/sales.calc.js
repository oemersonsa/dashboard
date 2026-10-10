import { getAvailablePeriods, state, parsePeriodKey, sortPeriodKeys, getPeriodMonth } from "../../core/state.js";
import { ALL_MONTHS } from "../../core/constants.js";

export function getMonthDays(month) {
  const p = parsePeriodKey(month);
  const mi = ALL_MONTHS.indexOf(p.month);
  if (mi < 0) return 30;
  return new Date(p.year, mi + 1, 0).getDate();
}

export function getLoggedDays(month) {
  const d = state.db[month];
  if (!d) return 0;
  return d.days.filter((day) =>
    state.platforms.some((p) => Number(day[p.key] || 0) > 0)
  ).length;
}

function getDayNumber(v) {
  const n = Number(String(v || "").split("/")[0]);
  return Number.isFinite(n) ? n : 0;
}

export function getLastLoggedDay(month) {
  const d = state.db[month];
  if (!d?.days?.length) return 0;
  return d.days.reduce((m, day) => {
    const has = state.platforms.some((p) => Number(day[p.key] || 0) > 0);
    if (!has) return m;
    return Math.max(m, getDayNumber(day.d));
  }, 0);
}

let totalsCache = null;
export function withTotalsCache(render) {
  const previous = totalsCache;
  totalsCache = new Map();
  try { return render(); } finally { totalsCache = previous; }
}
export function calcTotals(month, options = {}) {
  if (!totalsCache) return calculateTotals(month, options);
  const key = `${month}:${options.cutoffDay || 0}`;
  if (!totalsCache.has(key)) totalsCache.set(key, calculateTotals(month, options));
  return totalsCache.get(key);
}
function calculateTotals(month, options = {}) {
  const data = state.db[month];
  if (!data) return null;

  const cd = Math.max(0, Number(options.cutoffDay || 0));
  const fd = cd > 0
    ? data.days.filter((d) => {
        const n = getDayNumber(d.d);
        return n > 0 && n <= cd;
      })
    : data.days;

  const sales = {};
  const op = {};
  state.platforms.forEach((p) => {
    sales[p.key] = fd.reduce((s, d) => s + Number(d[p.key] || 0), 0);
    op[p.key] = fd.reduce((s, d) => s + Math.max(0, Math.round(Number(d[`orders_${p.key}`] || 0))), 0);
  });

  const orders = state.platforms.reduce((s, p) => s + (op[p.key] || 0), 0);

  const fs = {};
  state.platforms.forEach((p) => {
    fs[p.key] = data.days.reduce((s, d) => s + Number(d[p.key] || 0), 0);
  });

  const ret = {};
  state.platforms.forEach((p) => {
    const tr = Number((data.returns || {})[p.key] || 0);
    if (!cd || cd >= getMonthDays(month)) { ret[p.key] = tr; return; }
    const fv = Number(fs[p.key] || 0);
    const pv = Number(sales[p.key] || 0);
    const sh = fv > 0 ? Math.min(pv / fv, 1) : 0;
    ret[p.key] = tr * sh;
  });

  const gross = state.platforms.reduce((s, p) => s + Number(sales[p.key] || 0), 0);
  const totalRet = state.platforms.reduce((s, p) => s + Number(ret[p.key] || 0), 0);

  return { sales, ret, gross, totalRet, net: gross - totalRet, orders, ordersByPlatform: op };
}

export function getComparisonPeriod(month) {
  const sm = getAvailablePeriods();
  const ci = sm.indexOf(month);
  const pn = ci > 0 ? sm[ci - 1] : null;
  const lastLoggedDay = getLastLoggedDay(month);
  const cd = pn && lastLoggedDay > 0
    ? Math.min(lastLoggedDay, getMonthDays(month), getMonthDays(pn))
    : lastLoggedDay;
  return {
    previousName: pn,
    cutoffDay: cd,
    currentTotals: calcTotals(month),
    currentComparisonTotals: cd > 0 ? calcTotals(month, { cutoffDay: cd }) : calcTotals(month),
    previousTotals: pn ? calcTotals(pn, { cutoffDay: cd || 0 }) : null
  };
}

export function getWeekBuckets(monthName, days) {
  const p = parsePeriodKey(monthName);
  const mi = ALL_MONTHS.indexOf(getPeriodMonth(monthName));
  if (mi < 0) return [];

  const td = getMonthDays(monthName);
  const fw = new Date(p.year, mi, 1).getDay();
  const ranges = [];
  let sd = 1;
  let fwl = 7 - fw;
  if (fwl <= 0 || fw === 0) fwl = 7;

  while (sd <= td) {
    const wl = ranges.length === 0 ? fwl : 7;
    const ed = Math.min(td, sd + wl - 1);
    ranges.push({ startDay: sd, endDay: ed, total: 0, platforms: {} });
    sd = ed + 1;
  }

  state.platforms.forEach((p) => {
    ranges.forEach((r) => { r.platforms[p.key] = 0; });
  });

  days.forEach((day) => {
    const dn = Number((day.d || "").split("/")[0]);
    if (!dn) return;
    const b = ranges.find((i) => dn >= i.startDay && dn <= i.endDay);
    if (!b) return;
    const t = state.platforms.reduce((s, p) => {
      const v = Number(day[p.key] || 0);
      b.platforms[p.key] += v;
      return s + v;
    }, 0);
    b.total += t;
  });

  return ranges.map((b, i) => ({
    index: i, total: b.total, platforms: b.platforms,
    label: b.startDay === b.endDay ? `${b.startDay}` : `${b.startDay}-${b.endDay}`,
    shortLabel: `${i + 1}a sem.`
  }));
}
