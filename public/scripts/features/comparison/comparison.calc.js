import { ALL_MONTHS } from "../../core/constants.js";
import { state, parsePeriodKey, formatPeriodKey } from "../../core/state.js";
import { calcTotals, getMonthDays } from "../sales/sales.calc.js";

export function comparisonWindow(reference, baseline, now = new Date()) {
  const { year, month } = parsePeriodKey(reference);
  const completed = year * 12 + ALL_MONTHS.indexOf(month) < now.getFullYear() * 12 + now.getMonth();
  if (completed) return { partial: false, currentCutoff: null, previousCutoff: null };
  const lastDay = (state.db[reference]?.days || []).reduce((last, day) => {
    const number = Number(String(day.d || "").split("/")[0]);
    return Number.isInteger(number) && number > 0 && number <= getMonthDays(reference) ? Math.max(last, number) : last;
  }, 0);
  return { partial: true, currentCutoff: lastDay, previousCutoff: baseline ? Math.min(lastDay, getMonthDays(baseline)) : lastDay };
}

export function previousCalendarMonth(period) {
  const { year, month } = parsePeriodKey(period);
  const index = ALL_MONTHS.indexOf(month);
  return formatPeriodKey(ALL_MONTHS[(index + 11) % 12], index === 0 ? year - 1 : year);
}

export function variation(current, previous) {
  if (current == null || previous == null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous * 100;
}

export function comparisonValues(period, platformKey = "", cutoffDay = null) {
  if (cutoffDay === 0) return null;
  const totals = calcTotals(period, { cutoffDay: cutoffDay || 0 });
  if (!totals) return null;
  return platformKey
    ? { sales: totals.sales[platformKey] || 0, returns: totals.ret[platformKey] || 0, orders: totals.ordersByPlatform[platformKey] || 0 }
    : { sales: totals.gross, returns: totals.totalRet, orders: totals.orders };
}
