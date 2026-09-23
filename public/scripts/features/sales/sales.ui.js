/* ═══════════════════════════════════════════════════════════════
   features/sales/sales.ui.js — Dashboard (KPIs, gráficos, tabelas)
   ═══════════════════════════════════════════════════════════════ */

import {
  state,
  saveState,
  sortPeriodKeys,
  getPeriodYear,
  getPeriodMonth,
  getPeriodLabel,
  parsePeriodKey
} from "../../core/state.js";
import { R, RS, escapeHtml, escapeAttribute, alphaColor } from "../../core/format.js";
import { DASH_HTML as dash, ALL_MONTHS, SHORT } from "../../core/constants.js";
import { platformBadge, platformIcon } from "../../ui/icons.js";
import { getPlatformVisualColor } from "../../ui/charts.js";
import { toast, toastSuccess, toastError } from "../../ui/toast.js";
import { openModal, closeModal } from "../../ui/modal.js";
import {
  calcTotals,
  getComparisonPeriod,
  getWeekBuckets,
  getMonthDays,
  getLoggedDays,
  getLastLoggedDay
} from "./sales.calc.js";
import { init as initProjection } from "../projection/projection.ui.js";
import { renderWeekly } from "../weekly/weekly.ui.js";
import { init as initReturns } from "../returns/returns.ui.js";

let bound = false;
let dailyChart = null;
let newMonthSel = null;

/* ═══ PLUGIN: linha de brilho no topo de cada stack ═══ */
const topHighlightPlugin = {
  id: "topHighlight",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const datasets = chart.data.datasets;
    if (!datasets.length) return;

    const dayCount = chart.data.labels.length;

    for (let dayIdx = 0; dayIdx < dayCount; dayIdx++) {
      let topY = null;
      let topX = null;
      let topColor = null;
      let topWidth = 22;

      for (let dsIdx = 0; dsIdx < datasets.length; dsIdx++) {
        const meta = chart.getDatasetMeta(dsIdx);
        const el = meta?.data?.[dayIdx];
        if (!el) continue;

        const value = Number(datasets[dsIdx].data[dayIdx] || 0);
        if (value <= 0) continue;

        if (topY === null || el.y < topY) {
          topY = el.y;
          topX = el.x;
          topColor = datasets[dsIdx].hoverBackgroundColor
            || datasets[dsIdx].borderColor
            || "#000";
          // largura da barra
          const barWidth = el.width || (el.x + el.base) ? Math.abs(el.width || 20) : 20;
          topWidth = Math.max(16, Math.min(barWidth - 4, 26));
        }
      }

      if (topY !== null && topX !== null && topColor) {
        ctx.save();
        ctx.strokeStyle = topColor;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(topX - topWidth / 2, topY);
        ctx.lineTo(topX + topWidth / 2, topY);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
};

// Registra uma vez
if (typeof Chart !== "undefined" && !Chart.registry.plugins.get("topHighlight")) {
  Chart.register(topHighlightPlugin);
}

/* ═══ INIT ═══ */
export function init() {
  renderSaleInputs();
  renderTabs();
  const im = document.getElementById("inputMonth");
  if (im) im.value = state.currentMonth;
  syncDateWithMonth();
  renderAll();
  const rm = document.getElementById("returnMonth");
  if (rm) rm.value = state.currentMonth;
  initReturns();
  if (!bound) { bindEvents(); bound = true; }
}

/* ═══ RENDER ALL ═══ */
export function renderAll() {
  if (!state.platforms.length || !state.db[state.currentMonth]) return;
  renderKPIs();
  renderDailyChart();
  renderDailyTable();
  renderPlatformBars();
  renderWeekly(state.currentMonth);
  renderBestDays();
  renderPlatformTable();
  renderMonthCompare();
  initProjection();
}

/* ═══ KPIs ═══ */
function renderKPIs() {
  const c = getComparisonPeriod(state.currentMonth);
  const t = c.currentTotals;
  const pn = c.previousName;
  const pt = c.previousTotals;
  const rp = t.gross > 0 ? (t.totalRet / t.gross) * 100 : 0;
  const cl = pt
    ? `${getPeriodLabel(pn)}${c.cutoffDay ? ` até dia ${c.cutoffDay}` : ""}`
    : getPeriodLabel(state.currentMonth);
  const el = document.getElementById("kpiRow");
  if (!el) return;

  el.innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Vendas</div><div class="kpi-value">${RS(t.gross)}</div><div class="kpi-change">${pt ? `${varH(t.gross, pt.gross)} vs ${cl}` : getPeriodLabel(state.currentMonth)}</div></div>
    <div class="kpi-card"><div class="kpi-label">Vendas após devoluções</div><div class="kpi-value">${RS(t.net)}</div><div class="kpi-change">${pt ? `${varH(t.net, pt.net)} vs ${cl}` : dash}</div></div>
    <div class="kpi-card"><div class="kpi-label">Pedidos</div><div class="kpi-value">${t.orders}</div><div class="kpi-change">${pt ? `${varH(t.orders, pt.orders)} vs ${cl}` : dash}</div><div class="kpi-change" style="color:var(--muted)">${t.orders > 0 ? `${RS(t.gross / t.orders)} por pedido` : "Sem pedidos lançados"}</div></div>
    <div class="kpi-card"><div class="kpi-label">Devoluções</div><div class="kpi-value">${RS(t.totalRet)}</div><div class="kpi-change">${pt ? `${varH(t.totalRet, pt.totalRet, true)} vs ${cl}` : dash}</div><div class="kpi-change" style="color:var(--muted)">${rp.toFixed(1)}% das vendas</div><div class="returns-bar"><div class="returns-fill" style="width:${Math.min(rp, 100)}%"></div></div></div>
    <div class="kpi-card"><div class="kpi-label">Ticket Médio</div><div class="kpi-value">${t.orders > 0 ? RS(t.gross / t.orders) : RS(0)}</div><div class="kpi-change" style="color:var(--muted)">por pedido</div></div>
  `;
}

/* ═══ DAILY CHART ═══ */
function renderDailyChart() {
  const data = state.db[state.currentMonth];
  const c = document.getElementById("dailyChart");
  if (!c || !data) return;

  const active = state.platforms.filter((p) =>
    data.days.some((d) => Number(d[p.key] || 0) > 0)
  );
  const ctx = c.getContext("2d");
  if (dailyChart) dailyChart.destroy();

  if (!active.length || !data.days.length) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }

  // Gradiente vertical para cada plataforma
  function makeGradient(color, maxHeight) {
    const g = ctx.createLinearGradient(0, 0, 0, maxHeight);
    g.addColorStop(0, alphaColor(color, 1));
    g.addColorStop(0.5, alphaColor(color, 0.85));
    g.addColorStop(1, alphaColor(color, 0.4));
    return g;
  }

  // Ordem: plataformas maiores embaixo (stacked mais legível)
  const totals = {};
  active.forEach((p) => {
    totals[p.key] = data.days.reduce((s, d) => s + Number(d[p.key] || 0), 0);
  });
  const sorted = [...active].sort((a, b) => totals[b.key] - totals[a.key]);

  const chartHeight = c.parentElement?.clientHeight || 400;
  const maxBarHeight = Math.max(60, chartHeight - 60);

  const datasets = sorted.map((p, idx) => {
    const isTop = idx === sorted.length - 1;
    const color = getPlatformVisualColor(p);
    return {
      label: p.name,
      data: data.days.map((d) => Number(d[p.key] || 0)),
      backgroundColor: makeGradient(color, maxBarHeight),
      hoverBackgroundColor: color,
      borderColor: "transparent",
      borderWidth: 0,
      borderRadius: isTop
        ? { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 }
        : 0,
      borderSkipped: false,
      barPercentage: 0.7,
      categoryPercentage: 0.8
    };
  });

  dailyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.days.map((d) => d.d),
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 8, right: 8, left: 0, bottom: 0 } },
      plugins: {
        legend: {
          position: "bottom",
          align: "start",
          labels: {
            color: "#86868b",
            font: { family: "inherit", size: 11, weight: "500" },
            boxWidth: 8,
            boxHeight: 8,
            padding: 12,
            usePointStyle: true,
            pointStyle: "circle"
          }
        },
        tooltip: {
          backgroundColor: "rgba(17, 19, 24, 0.95)",
          titleColor: "#f0f2f7",
          titleFont: { size: 12, weight: "600" },
          bodyColor: "#f0f2f7",
          bodyFont: { size: 12 },
          borderColor: "rgba(255, 255, 255, 0.08)",
          borderWidth: 1,
          padding: 12,
          cornerRadius: 10,
          displayColors: true,
          boxWidth: 8,
          boxHeight: 8,
          boxPadding: 4,
          usePointStyle: true,
          callbacks: {
            label: (item) => {
              const value = Number(item.raw || 0);
              if (value === 0) return null;
              const total = item.chart.data.datasets.reduce(
                (s, ds) => s + Number(ds.data[item.dataIndex] || 0), 0
              );
              const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
              return ` ${item.dataset.label}: ${R(value)} (${pct}%)`;
            },
            footer: (items) => {
              if (!items.length) return "";
              const total = items.reduce((s, i) => s + Number(i.raw || 0), 0);
              return `Total: ${R(total)}`;
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          ticks: {
            color: "#86868b",
            font: { size: 10, family: "inherit" },
            maxRotation: 0,
            autoSkipPadding: 12
          },
          grid: { display: false },
          border: { display: false }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: {
            color: "#86868b",
            font: { size: 10, family: "inherit" },
            padding: 8,
            callback: (v) => RS(v)
          },
          grid: {
            color: "rgba(134, 134, 139, 0.05)",
            drawTicks: false,
            drawBorder: false,
            lineWidth: 1
          },
          border: { display: false }
        }
      }
    },
    plugins: [topHighlightPlugin]
  });
}

/* ═══ DAILY TABLE ═══ */
function renderDailyTable() {
  const data = state.db[state.currentMonth];
  const t = document.getElementById("dailyDetailsTable");
  if (!t || !data) return;

  const active = state.platforms.filter((p) =>
    data.days.some((d) => Number(d[p.key] || 0) > 0)
  );
  if (!data.days.length || !active.length) {
    t.innerHTML = `<tbody><tr><td style="text-align:left;padding:20px;color:var(--muted)">Nenhuma venda registrada neste mês.</td></tr></tbody>`;
    return;
  }

  const totals = {};
  const top = {};
  active.forEach((p) => {
    totals[p.key] = data.days.reduce((s, d) => s + Number(d[p.key] || 0), 0);
    top[p.key] = data.days.reduce(
      (s, d) => s + Math.max(0, Math.round(Number(d[`orders_${p.key}`] || 0))), 0
    );
  });
  const gt = active.reduce((s, p) => s + totals[p.key], 0);

  const head = `<thead><tr><th>Data</th>${active.map((p) =>
    `<th><span class="chdot" style="background:${getPlatformVisualColor(p)}"></span>${p.icon} Vendas</th>` +
    `<th><span class="chdot" style="background:${getPlatformVisualColor(p)}"></span>${p.icon} Ped.</th>`
  ).join("")}<th>Total</th></tr></thead>`;

  const body = data.days.map((d, di) => {
    const rt = active.reduce((s, p) => s + Number(d[p.key] || 0), 0);
    return `<tr><td>${d.d}</td>${active.map((p) => {
      const v = Number(d[p.key] || 0);
      const ov = Math.max(0, Math.round(Number(d[`orders_${p.key}`] || 0)));
      return `<td><span class="ceditable${v === 0 ? " czero" : ""}" contenteditable="true" data-day-index="${di}" data-platform-key="${p.key}">${v === 0 ? "-" : v.toFixed(2)}</span></td>` +
        `<td><span class="ceditable${ov === 0 ? " czero" : ""}" contenteditable="true" data-day-index="${di}" data-platform-key="orders_${p.key}">${ov === 0 ? "-" : ov}</span></td>`;
    }).join("")}<td style="color:var(--muted2);font-size:11px">${rt > 0 ? RS(rt) : "-"}</td></tr>`;
  }).join("");

  const foot = `<tfoot><tr><td>Total</td>${active.map((p) =>
    `<td>${RS(totals[p.key])}</td><td>${top[p.key]}</td>`
  ).join("")}<td>${RS(gt)}</td></tr></tfoot>`;

  t.innerHTML = head + body + foot;
}

/* ═══ PLATFORM BARS (Mix) ═══ */
function renderPlatformBars() {
  const totals = calcTotals(state.currentMonth);
  const c = document.getElementById("platformBars");
  if (!c || !totals) return;

  const rows = state.platforms
    .map((p) => {
      const gross = Math.max(0, Number(totals.sales[p.key] || 0));
      const returns = Math.max(0, Number(totals.ret[p.key] || 0));
      const net = Math.max(0, gross - returns);
      return { platform: p, gross, returns, net };
    })
    .filter((r) => r.gross > 0 || r.returns > 0)
    .sort((a, b) => b.net - a.net);

  if (!rows.length) {
    c.innerHTML = `<div class="pb-empty">Sem dados suficientes para o mix.</div>`;
    return;
  }

  const max = rows[0].net || 1;
  const totalGross = rows.reduce((s, r) => s + r.gross, 0);
  const totalReturns = rows.reduce((s, r) => s + r.returns, 0);

  c.innerHTML = rows.map(({ platform, gross, returns, net }) => {
    const wp = max > 0 ? (net / max) * 100 : 0;
    const returnRate = gross > 0 ? (returns / gross) * 100 : 0;
    return `
      <div class="pb-row">
        <div class="pb-head">
          <div class="pb-name">${platformIcon(platform)}<span>${escapeHtml(platform.name)}</span></div>
          <div class="pb-meta">
            <span class="pb-meta-item">
              <span class="pb-meta-label">Vendas</span>
              <span class="pb-meta-value">${R(gross)}</span>
            </span>
            ${returns > 0 ? `
              <span class="pb-meta-item pb-meta-returns">
                <span class="pb-meta-label">Dev.</span>
                <span class="pb-meta-value">${R(returns)}</span>
                <span class="pb-meta-rate">${returnRate.toFixed(1)}%</span>
              </span>
            ` : ""}
            <span class="pb-meta-item pb-meta-net">
              <span class="pb-meta-label">Líquido</span>
              <span class="pb-meta-value">${R(net)}</span>
            </span>
          </div>
        </div>
        <div class="pb-track"><div class="pb-fill" style="width:${wp.toFixed(1)}%;background:${getPlatformVisualColor(platform)}"></div></div>
      </div>
    `;
  }).join("") + `
    <div class="pb-total">
      <span>Total do mês</span>
      <span><strong>${R(totalGross)}</strong> em vendas</span>
      <span class="pb-total-returns"><strong>${R(totalReturns)}</strong> em devoluções</span>
      <span class="pb-total-net"><strong>${R(totalGross - totalReturns)}</strong> líquido</span>
    </div>
  `;
}

/* ═══ BEST DAYS ═══ */
function renderBestDays() {
  const data = state.db[state.currentMonth];
  const el = document.getElementById("bestDayGrid");
  if (!data || !el) return;

  const best = {};
  data.days.forEach((d) => {
    state.platforms.forEach((p) => {
      const v = Number(d[p.key] || 0);
      if (!best[p.key] || v > best[p.key].v) best[p.key] = { v, d: d.d };
    });
  });

  const html = state.platforms
    .filter((p) => best[p.key] && best[p.key].v > 0)
    .map((p) => `
      <div class="bdrow">
        <div class="bdl">${platformBadge(p)}</div>
        <div class="bdr">
          <div class="bdval">${RS(best[p.key].v)}</div>
          <div class="bddate">${escapeHtml(best[p.key].d)}</div>
        </div>
      </div>
    `).join("");

  el.innerHTML = html || `<div class="empty-state">Ainda não há dias destacados.</div>`;
}

/* ═══ PLATFORM TABLE ═══ */
function renderPlatformTable() {
  const c = getComparisonPeriod(state.currentMonth);
  const t = c.currentTotals;
  const pt = c.previousTotals;
  const el = document.getElementById("platformTable");
  if (!el || !t) return;

  const active = state.platforms.filter((p) => t.sales[p.key] > 0 || t.ret[p.key] > 0);
  if (!active.length) {
    el.innerHTML = `<tbody><tr><td style="text-align:left;padding:20px;color:var(--muted)">Cadastre vendas para ver o resumo por plataforma.</td></tr></tbody>`;
    return;
  }

  const nt = active.reduce((s, p) => s + Math.max(0, t.sales[p.key] - t.ret[p.key]), 0);

  el.innerHTML = `
    <thead><tr><th>Plataforma</th><th>Vendas</th><th>Devoluções</th><th>% Dev.</th><th>vs Mês Ant.</th><th>Após devoluções</th><th>% Mix</th></tr></thead>
    <tbody>${active.map((p) => {
      const v = t.sales[p.key] || 0;
      const r = t.ret[p.key] || 0;
      const net = Math.max(0, v - r);
      const pn = pt ? Math.max(0, (pt.sales[p.key] || 0) - (pt.ret[p.key] || 0)) : null;
      const rr = v > 0 ? (r / v) * 100 : 0;
      const pc = nt > 0 ? ((net / nt) * 100).toFixed(1) : "0.0";
      return `<tr>
        <td data-label="Plataforma">${platformBadge(p)}</td>
        <td data-label="Vendas">${R(v)}</td>
        <td data-label="Devoluções" class="neg">${r > 0 ? R(r) : "-"}</td>
        <td data-label="% Dev." style="color:var(--muted)">${rr.toFixed(1)}%</td>
        <td data-label="vs Mês Ant.">${pt ? varH(net, pn) : dash}</td>
        <td data-label="Após devoluções" style="font-weight:700">${R(net)}</td>
        <td data-label="% Mix"><span class="ppill">${pc}%</span></td>
      </tr>`;
    }).join("")}</tbody>
    <tfoot><tr>
      <td data-label="Plataforma" style="color:var(--accent)">Total</td>
      <td data-label="Vendas">${R(t.gross)}</td>
      <td data-label="Devoluções" class="neg">${R(t.totalRet)}</td>
      <td data-label="% Dev." style="color:var(--muted)">${t.gross > 0 ? ((t.totalRet / t.gross) * 100).toFixed(1) : 0}%</td>
      <td data-label="vs Mês Ant.">${pt ? varH(t.net, pt.net) : dash}</td>
      <td data-label="Após devoluções" style="color:var(--accent)">${R(t.net)}</td>
      <td data-label="% Mix"><span class="ppill">100%</span></td>
    </tr></tfoot>
  `;
}

/* ═══ MONTH COMPARE ═══ */
function renderMonthCompare() {
  const c = getComparisonPeriod(state.currentMonth);
  const t = c.currentTotals;
  const pn = c.previousName;
  const pt = c.previousTotals;
  const el = document.getElementById("monthCompareCards");
  if (!el || !t) return;

  const pl = pt && c.cutoffDay
    ? `${getPeriodLabel(pn)} até dia ${c.cutoffDay}`
    : (pn ? getPeriodLabel(pn) : "");

  el.innerHTML = `<div class="compare-grid">
    <div class="compare-card compare-card-current">
      <div class="compare-month">${getPeriodLabel(state.currentMonth)}</div>
      <div class="compare-value compare-value-current">${RS(t.net)}</div>
      <div class="compare-meta">Bruto: ${RS(t.gross)}</div>
      <div class="compare-meta compare-meta-neg">Dev: ${RS(t.totalRet)}</div>
    </div>
    ${pt ? `<div class="compare-card">
      <div class="compare-month">${pl}</div>
      <div class="compare-value">${RS(pt.net)}</div>
      <div class="compare-meta">Bruto: ${RS(pt.gross)}</div>
      <div class="compare-meta compare-meta-neg">Dev: ${RS(pt.totalRet)}</div>
    </div>` : `<div class="compare-card compare-card-empty"><span>Sem mês anterior</span></div>`}
  </div>`;
}

/* ═══ SALE INPUTS ═══ */
export function renderSaleInputs() {
  const el = document.getElementById("saleInputs");
  if (!el) return;
  el.innerHTML = state.platforms.map((p) => `
    <div class="fg">
      <label class="flabel">${platformBadge(p)}</label>
      <input type="number" class="finput" id="sale_${escapeAttribute(p.key)}" placeholder="0,00" step="0.01" min="0">
    </div>
    <div class="fg">
      <label class="flabel">${platformBadge(p, true)}</label>
      <input type="number" class="finput" id="orders_${escapeAttribute(p.key)}" placeholder="0" step="1" min="0">
    </div>
  `).join("");
}

/* ═══ TABS / PERÍODO ═══ */
export function renderTabs() {
  const am = sortPeriodKeys(Object.keys(state.db));
  const cy = getPeriodYear(state.currentMonth);
  const ys = [...new Set(am.map(getPeriodYear))].sort((a, b) => a - b);

  const ye = document.getElementById("sidebarCurrentYear");
  const me = document.getElementById("sidebarCurrentMonth");
  if (ye) ye.textContent = String(cy);
  if (me) me.textContent = getPeriodMonth(state.currentMonth);

  const opts = ys.map((y) => {
    const yo = am.filter((m) => getPeriodYear(m) === y)
      .map((m) => `<option value="${m}"${m === state.currentMonth ? " selected" : ""}>${getPeriodLabel(m)}</option>`)
      .join("");
    return `<optgroup label="${y}">${yo}</optgroup>`;
  }).join("");

  ["inputMonth", "returnMonth"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
}

export function syncDateWithMonth() {
  const m = document.getElementById("inputMonth")?.value || state.currentMonth;
  const di = document.getElementById("inputDate");
  if (!di) return;

  const p = parsePeriodKey(m);
  const mi = ALL_MONTHS.indexOf(p.month);
  if (mi < 0) return;

  const today = new Date();
  const d = Math.min(today.getDate(), getMonthDays(m));
  const suggested = `${p.year}-${String(mi + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (di.value !== suggested) di.value = suggested;
}

export function switchMonth(month) {
  state.currentMonth = month;
  saveState();
  renderTabs();
  const im = document.getElementById("inputMonth");
  if (im) im.value = month;
  syncDateWithMonth();
  renderAll();
}

/* ═══ MODAL DE MÊS ═══ */
export function openAddMonth() {
  newMonthSel = null;
  const cy = getPeriodYear(state.currentMonth);
  const yi = document.getElementById("periodYearInput");
  if (yi) yi.value = cy;
  refreshMonthPickerForYear();
  const m = document.getElementById("addMonthModal");
  if (m) m.classList.add("open");
}

export function refreshMonthPickerForYear() {
  const year = Number(
    document.getElementById("periodYearInput")?.value || getPeriodYear(state.currentMonth)
  );
  const existing = new Set(
    Object.keys(state.db)
      .filter((p) => getPeriodYear(p) === year)
      .map((p) => getPeriodMonth(p))
  );
  newMonthSel = null;
  const picker = document.getElementById("monthPicker");
  if (!picker) return;
  picker.innerHTML = ALL_MONTHS.map((month) => {
    const exists = existing.has(month);
    const isCur = exists && state.currentMonth === `${year}-${month}`;
    const cls = ["mbtn"];
    if (isCur) cls.push("sel");
    return `<button class="${cls.join(" ")}" data-picker-month="${month}" type="button" title="${exists ? "Ir para este mês" : "Criar este mês"}">${SHORT[month] || month}</button>`;
  }).join("");
}

export function selectMonth(month) {
  newMonthSel = month;
  document.querySelectorAll("#monthPicker .mbtn").forEach((b) =>
    b.classList.toggle("sel", b.dataset.pickerMonth === month)
  );
}

export function confirmAddMonth() {
  if (!newMonthSel) return toastError("Selecione um mês");
  const year = Number(
    document.getElementById("periodYearInput")?.value || getPeriodYear(state.currentMonth)
  );
  const period = `${year}-${newMonthSel}`;
  if (!state.db[period]) state.db[period] = { days: [], returns: {} };
  state.currentMonth = period;
  saveState();
  closeModal("addMonthModal");
  renderTabs();
  renderAll();
  toastSuccess(`${getPeriodLabel(period)} criado`);
}

/* ═══ HELPERS ═══ */
function varH(current, previous, reverse = false) {
  if (previous === null || previous === undefined || previous === 0) return dash;
  const diff = ((current - previous) / previous) * 100;
  const increased = diff >= 0;
  const good = reverse ? diff < 0 : diff >= 0;
  const cls = good ? "up" : "down";
  const arrow = increased ? "↑" : "↓";
  return `<span class="${cls}">${arrow} ${Math.abs(diff).toFixed(1)}%</span>`;
}

/* ═══ BIND DE EVENTOS LOCAIS ═══ */
function bindEvents() {
  document.getElementById("inputMonth")?.addEventListener("change", syncDateWithMonth);

  document.querySelectorAll(".itab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".itab").forEach((b) => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".ipanel").forEach((p) =>
        p.classList.toggle("active", p.id === `panel-${btn.dataset.tab}`)
      );
    });
  });

  document.getElementById("registerSaleButton")?.addEventListener("click", addSale);
  document.getElementById("clearSaleButton")?.addEventListener("click", clearSale);
  document.getElementById("openDailyDetailsButton")
    ?.addEventListener("click", () => openModal("dailyDetailsModal"));

  const dt = document.getElementById("dailyDetailsTable");
  if (dt) {
    dt.addEventListener("focusin", (e) => {
      const cell = e.target.closest(".ceditable");
      if (!cell) return;
      const r = document.createRange();
      r.selectNodeContents(cell);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    });
    dt.addEventListener("blur", (e) => {
      const cell = e.target.closest(".ceditable");
      if (!cell) return;
      updateCell(Number(cell.dataset.dayIndex), cell.dataset.platformKey, cell);
    }, true);
  }
}

function addSale() {
  const mEl = document.getElementById("inputMonth");
  const dEl = document.getElementById("inputDate");
  if (!mEl || !dEl) return;

  const month = mEl.value;
  const dateValue = dEl.value;
  if (!dateValue) return toastError("Selecione a data");

  const parts = dateValue.split("-");
  const smi = ALL_MONTHS.indexOf(getPeriodMonth(month));
  const sy = getPeriodYear(month);
  if (smi < 0) return toastError("Mês inválido");
  if (Number(parts[0]) !== sy || Number(parts[1]) !== smi + 1) {
    syncDateWithMonth();
    return toast("A data foi ajustada para o período selecionado");
  }

  if (!state.db[month]) state.db[month] = { days: [], returns: {} };
  const label = `${parts[2]}/${parts[1]}`;
  const entry = { d: label };
  let hasValue = false;

  state.platforms.forEach((p) => {
    const v = parseFloat(document.getElementById(`sale_${p.key}`)?.value || 0) || 0;
    entry[p.key] = v;
    const o = Math.max(0, Math.round(parseFloat(document.getElementById(`orders_${p.key}`)?.value || 0) || 0));
    entry[`orders_${p.key}`] = o;
    if (v > 0) hasValue = true;
  });

  if (!hasValue) return toastError("Insira ao menos um valor");

  const ei = state.db[month].days.findIndex((d) => d.d === label);
  if (ei >= 0) {
    state.platforms.forEach((p) => {
      state.db[month].days[ei][p.key] = Number(state.db[month].days[ei][p.key] || 0) + Number(entry[p.key] || 0);
      const ok = `orders_${p.key}`;
      state.db[month].days[ei][ok] = Math.max(0, Math.round(Number(state.db[month].days[ei][ok] || 0) + Number(entry[ok] || 0)));
    });
  } else {
    state.db[month].days.push(entry);
    state.db[month].days.sort((a, b) => {
      const [da, ma] = (a.d || "").split("/").map(Number);
      const [db, mb] = (b.d || "").split("/").map(Number);
      return ma !== mb ? ma - mb : da - db;
    });
  }

  saveState();
  if (month === state.currentMonth) renderAll();
  clearSale();
  toastSuccess(`Vendas registradas em ${getPeriodLabel(month)}`);
}

function clearSale() {
  state.platforms.forEach((p) => {
    const e = document.getElementById(`sale_${p.key}`);
    if (e) e.value = "";
    const o = document.getElementById(`orders_${p.key}`);
    if (o) o.value = "";
  });
}

function updateCell(di, key, el) {
  const rv = parseFloat((el.textContent || "").replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;
  const isOrder = key === "orders" || key.startsWith("orders_");
  const v = isOrder ? Math.max(0, Math.round(rv)) : rv;
  state.db[state.currentMonth].days[di][key] = v;
  saveState();
  renderAll();
  toastSuccess("Valor atualizado");
}