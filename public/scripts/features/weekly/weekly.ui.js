import { state } from "../../core/state.js";
import { RS, escapeHtml } from "../../core/format.js";
import { DASH_HTML as dash } from "../../core/constants.js";
import { platformBadge } from "../../ui/icons.js";
import { getPlatformVisualColor } from "../../ui/charts.js";
import { getWeekBuckets, getComparisonPeriod } from "../sales/sales.calc.js";

export function renderWeekly(month) {
  const data = state.db[month];
  if (!data) return;

  const w = getWeekBuckets(month, data.days);
  const c = getComparisonPeriod(month);
  const pw = c.previousName && state.db[c.previousName]
    ? getWeekBuckets(c.previousName, state.db[c.previousName].days.filter((d) => {
        const n = Number((d.d || "").split("/")[0]);
        return !c.cutoffDay || (n > 0 && n <= c.cutoffDay);
      }))
    : [];

  const total = w.reduce((s, i) => s + i.total, 0);
  const max = Math.max(...w.map((i) => i.total), 1);
  const colors = ["#e8ff47", "#47d4ff", "#a78bfa", "#34d399", "#fb923c", "#f472b6"];
  const wb = document.getElementById("weekBars");
  if (!wb) return;

  wb.innerHTML = w.map((item, i) => {
    const v = item.total;
    const pct = total > 0 ? (v / total) * 100 : 0;
    const pv = pw[i]?.total || 0;
    const cmp = c.previousName ? varH(v, pv) : "";
    const col = colors[i % colors.length];

    const platformRows = state.platforms
      .filter((p) => Number(item.platforms?.[p.key] || 0) > 0)
      .map((p) => {
        const pv2 = Number(item.platforms?.[p.key] || 0);
        const pp = v > 0 ? (pv2 / v) * 100 : 0;
        return `<div class="week-platform-row"><div class="week-platform-name">${platformBadge(p)}</div><div class="week-platform-value">${pv2 > 0 ? RS(pv2) : "-"}</div><div class="week-platform-track"><div class="week-platform-fill" style="width:${pp}%;background:${getPlatformVisualColor(p)}"></div></div></div>`;
      }).join("");

    return `<div class="wbwrap week-card">
      <div class="week-card-head"><div><div class="wblabel">${item.shortLabel}</div><div class="wbpct">${escapeHtml(item.label)}</div></div><div class="week-card-total" style="color:${col}">${v > 0 ? RS(v) : "-"}</div></div>
      <div class="wbcon"><div class="wbar" style="height:${v > 0 ? Math.max(7, (v / max) * 100) : 0}%;background:${col};opacity:${v > 0 ? 1 : 0.15}"></div></div>
      <div class="week-card-meta"><span>${v > 0 ? `${pct.toFixed(1)}% do mês` : "Sem vendas"}</span><span>${cmp || dash}</span></div>
      <div class="week-platform-list">${platformRows}</div>
    </div>`;
  }).join("");
}

function varH(current, previous) {
  if (previous === null || previous === undefined || previous === 0) return dash;
  const diff = ((current - previous) / previous) * 100;
  const cls = diff >= 0 ? "up" : "down";
  const arrow = diff >= 0 ? "↑" : "↓";
  return `<span class="${cls}">${arrow} ${Math.abs(diff).toFixed(1)}%</span>`;
}