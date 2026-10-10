/* ═══════════════════════════════════════════════════════════════
   features/sales/sales.ui.js — Dashboard (KPIs, gráficos, tabelas)
   ═══════════════════════════════════════════════════════════════ */

import {
  state,
  saveState,
  saveNavigation,
  getAvailablePeriods,
  sortPeriodKeys,
  getPeriodYear,
  getPeriodMonth,
  getPeriodLabel,
  parsePeriodKey
} from "../../core/state.js";
import { R, RS, escapeHtml, escapeAttribute, alphaColor, parseMoney } from "../../core/format.js";
import { DASH_HTML as dash, ALL_MONTHS, SHORT } from "../../core/constants.js";
import { appIcon } from "../../ui/app-icons.js";
import { platformBadge, platformIcon } from "../../ui/icons.js";
import { getPlatformVisualColor } from "../../ui/charts.js";
import { toast, toastSuccess, toastError } from "../../ui/toast.js";
import { openModal, closeModal } from "../../ui/modal.js";
import {
  calcTotals,
  withTotalsCache,
  getComparisonPeriod,
  getWeekBuckets,
  getMonthDays,
  getLoggedDays,
  getLastLoggedDay
} from "./sales.calc.js";
import { init as initProjection } from "../projection/projection.ui.js";
import { renderWeekly } from "../weekly/weekly.ui.js";
import { init as initReturns } from "../returns/returns.ui.js";
import { showChartSkeleton, hideChartSkeleton, showPlatformBarsSkeleton } from "../../ui/skeleton.js";
import { computeGoalProgress, GOAL_STATUS, getStatusColorVar } from "../goals/goals.calc.js";
import { getGoal } from "../../core/state.js";

let bound = false;
let dailyChart = null;
let overviewTrendChart = null;
let overviewTrendBucketDays = 1;
let overviewTrendPeriod = "rolling30";
let newMonthSel = null;
let compareMonthKey = "";   // ⬅️ NOVO
let selectedPlatformKeys = null; // null = todas; array de keys = filtro ativo

/* ═══ INIT ═══ */
export function init() {
  renderSaleInputs();
  renderTabs();
  const im = document.getElementById("inputMonth");
  if (im && !im.value) im.value = state.currentMonth;
  syncDateWithMonth();
  renderAll();
  const rm = document.getElementById("returnMonth");
  if (rm) rm.value = state.currentMonth;
  initReturns();
  if (!bound) { bindEvents(); bound = true; }
}

/* ═══ RENDER ALL ═══ */
export function renderAll() {
  return withTotalsCache(renderActivePanel);
}
function renderActivePanel() {
  renderTrackingAlerts();
  if (!state.platforms.length || !state.db[state.currentMonth]) return;
  const tab = state.activeTab || "overview";
  if (tab === "overview") {
    renderKPIs(); renderOverviewTrend(); renderPlatformBars(); renderOverviewRecent();
    renderBestDays(); renderPlatformTable(); renderMonthCompare();
  } else if (tab === "daily") {
    renderComparePicker(); renderDailyChart();
    renderOverviewRecent("dailyInlineTable", Infinity);
    if (document.getElementById("dailyDetailsModal")?.classList.contains("open")) renderDailyTable();
  } else if (tab === "weekly") renderWeekly(state.currentMonth);
  else if (tab === "projection") initProjection();
}

export function renderTrackingAlerts() {
  const el = document.getElementById("goalAlertBanner");
  if (!el) return;

  const alerts = [];
  const target = getGoal(state.currentMonth);
  const p = computeGoalProgress(state.currentMonth, target, state);

  if (p.hasGoal) {
    const colorVar = `var(${getStatusColorVar(p.status)})`;
    const progressWidth = Math.min(100, Math.max(0, p.percent));
    const statusCopy = p.status === GOAL_STATUS.ATINGIDA
      ? "Meta atingida"
      : p.status === GOAL_STATUS.NO_RITMO
        ? "No ritmo da meta"
        : p.status === GOAL_STATUS.ATENCAO
          ? "Meta em atenção"
          : "Meta em risco";
    alerts.push(`<div class="goal-progress-alert" role="status">
      <div class="goal-progress-heading"><strong>${appIcon("target")}Meta mensal de vendas</strong><span>${R(p.target)}</span></div>
      <strong class="goal-progress-percent">${p.percent.toFixed(0)}%</strong>
      <div class="goal-progress-track" role="progressbar" aria-label="Progresso da meta de vendas após devoluções" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, Math.max(0, p.percent)).toFixed(1)}"><div class="goal-progress-fill" style="width:${progressWidth}%"></div></div>
      <div class="goal-progress-stat"><span>Realizado</span><strong>${R(p.realized)}</strong></div>
      <div class="goal-progress-stat"><span>Faltam</span><strong>${R(p.remaining)}</strong></div>
      <span class="goal-status-chip" style="color:${colorVar}"><i></i>${statusCopy}<small>Projeção: ${R(p.projected)}</small></span>
    </div>`);
  } else {
    alerts.push(`<div class="goal-progress-alert"><div class="goal-progress-heading"><strong>${appIcon("target")}Meta mensal de vendas</strong></div><p class="goal-empty">Defina uma meta de vendas após devoluções para acompanhar seu progresso.</p><button class="btn btn-secondary" data-dashboard-open="projection" type="button">Definir meta</button></div>`);
  }

  const comparison = getComparisonPeriod(state.currentMonth);
  const totals = comparison.currentTotals;
  if (totals && totals.totalRet > totals.gross * 0.25) {
    const rateDescription = totals.gross > 0
      ? ` (${((totals.totalRet / totals.gross) * 100).toFixed(1).replace(".", ",")}%)`
      : " (sem vendas brutas registradas)";
    alerts.push(`
      <div class="goal-alert return-rate-alert return-threshold-alert" role="alert">
        <div class="goal-alert-icon" aria-hidden="true">⚠</div>
        <div class="goal-alert-text">
          <strong>As devoluções ultrapassaram 25% das vendas brutas.</strong>
          Em ${escapeHtml(getPeriodLabel(state.currentMonth))}, as devoluções somam ${R(totals.totalRet)}${rateDescription}, sobre ${R(totals.gross)} em vendas brutas.
        </div>
      </div>
    `);
  }

  // O alerta comparativo só dispara quando a taxa sobe pelo menos 1 p.p.
  const current = comparison.previousTotals ? comparison.currentComparisonTotals : null;
  const previous = comparison.previousTotals;
  if (current?.gross > 0 && previous?.gross > 0) {
    const currentRate = (current.totalRet / current.gross) * 100;
    const previousRate = (previous.totalRet / previous.gross) * 100;
    const delta = currentRate - previousRate;
    if (delta >= 1) {
      alerts.push(`
        <div class="goal-alert return-rate-alert" role="status">
          <div class="goal-alert-icon" aria-hidden="true">⚠</div>
          <div class="goal-alert-text">
            <strong>A taxa de devoluções aumentou ${delta.toFixed(1).replace(".", ",")} p.p.</strong>
            (${previousRate.toFixed(1).replace(".", ",")}% para ${currentRate.toFixed(1).replace(".", ",")}%) em relação a ${escapeHtml(getPeriodLabel(comparison.previousName))}, considerando os mesmos dias do mês.
          </div>
        </div>
      `);
    }
  }

  el.innerHTML = alerts.join("");
  el.hidden = alerts.length === 0;
}

function renderOverviewRecent(id = "overviewRecentTable", limit = 5) {
  const table = document.getElementById(id);
  if (!table) return;
  const days = [...(state.db[state.currentMonth]?.days || [])].sort((a, b) => Number(b.d.slice(0, 2)) - Number(a.d.slice(0, 2))).slice(0, limit);
  table.innerHTML = `<thead><tr><th>Data</th>${state.platforms.filter(p => !p.archived).map(p => `<th>${escapeHtml(p.name)}</th>`).join("")}<th>Total de vendas</th><th>Pedidos</th></tr></thead><tbody>${days.map(day => `<tr><td>${escapeHtml(day.d)}/${state.currentMonth.slice(0, 4)}</td>${state.platforms.filter(p => !p.archived).map(p => `<td>${R(Number(day[p.key] || 0))}</td>`).join("")}<td><strong>${R(state.platforms.reduce((sum, p) => sum + Number(day[p.key] || 0), 0))}</strong></td><td>${state.platforms.reduce((sum, p) => sum + Number(day[`orders_${p.key}`] || 0), 0)}</td></tr>`).join("") || `<tr><td colspan="${state.platforms.filter(p => !p.archived).length + 3}">Nenhuma venda registrada neste mês.</td></tr>`}</tbody>`;
}

/* ═══ KPIs ═══ */
function renderKPIs() {
  const c = getComparisonPeriod(state.currentMonth);
  // Valores e variações do resumo devem usar a mesma janela do período anterior.
  const t = c.previousTotals ? c.currentComparisonTotals : c.currentTotals;
  const pn = c.previousName;
  const pt = c.previousTotals;
  const rp = t.gross > 0 ? (t.totalRet / t.gross) * 100 : 0;
  const comparisonContext = pt
    ? c.cutoffDay
      ? `Dias 1–${c.cutoffDay} · comparação com ${getPeriodLabel(pn)}`
      : `Mês completo · comparação com ${getPeriodLabel(pn)}`
    : `Período selecionado · ${getPeriodLabel(state.currentMonth)}`;
  const selected = parsePeriodKey(state.currentMonth);
  const today = new Date();
  const isCurrentPeriod = selected.year === today.getFullYear() && ALL_MONTHS.indexOf(selected.month) === today.getMonth();
  const elapsedDays = selected.year < today.getFullYear() || (selected.year === today.getFullYear() && ALL_MONTHS.indexOf(selected.month) < today.getMonth())
    ? getMonthDays(state.currentMonth)
    : isCurrentPeriod ? today.getDate() : 0;
  const monthData = state.db[state.currentMonth];
  const loggedDates = new Set((monthData?.days || []).filter((day) =>
    state.platforms.some((platform) => Number(day[platform.key] || 0) > 0 || Number(day[`orders_${platform.key}`] || 0) > 0)
  ).map((day) => Number(String(day.d || "").split("/")[0])));
  const unloggedDays = Array.from({ length: elapsedDays }, (_, index) => index + 1)
    .filter((day) => !loggedDates.has(day));
  const missingDays = unloggedDays.length;
  const periodStatus = isCurrentPeriod
    ? `Mês em andamento · dia ${today.getDate()} de ${getMonthDays(state.currentMonth)}`
    : elapsedDays > 0 ? `Período encerrado · dados lançados em ${loggedDates.size} dia(s)` : "Período futuro";
  const trackingStatus = elapsedDays > 0
    ? `${missingDays} dia(s) sem lançamento até ${String(elapsedDays).padStart(2, "0")}/${String(ALL_MONTHS.indexOf(selected.month) + 1).padStart(2, "0")}`
    : "Nenhum dia do período disponível";
  const missingDateLabels = unloggedDays.slice(0, 8).map((day) =>
    `${String(day).padStart(2, "0")}/${String(ALL_MONTHS.indexOf(selected.month) + 1).padStart(2, "0")}`
  );
  const missingDateSummary = `${missingDateLabels.join(", ")}${missingDays > missingDateLabels.length ? ` e mais ${missingDays - missingDateLabels.length}` : ""}`;
  const el = document.getElementById("kpiRow");
  if (!el) return;

  const metric = (name, current, previous, icon, color, cls, context = "", reverse = false, count = false) => {
    const detailFormat = count ? value => Number(value).toLocaleString("pt-BR") : R;
    const change = pt ? varH(current, previous, reverse) : "Sem mês anterior";
    const id = `${cls}-comparison`;
    const difference = current - previous;
    const windowLabel = pt && c.cutoffDay ? `Dias 1–${c.cutoffDay} de cada mês` : "Mês completo";
    const allocatedReturns = pt && c.cutoffDay && (cls === "kpi-card--returns" || cls === "kpi-card--net")
      && (c.cutoffDay < getMonthDays(state.currentMonth) || c.cutoffDay < getMonthDays(pn));
    const tooltip = `<div class="kpi-comparison-tooltip" id="${id}" role="tooltip">
      <strong>${escapeHtml(name)}</strong>
      <p>${escapeHtml(pt ? windowLabel : "Período selecionado")}</p>
      <dl>
        <div><dt>${escapeHtml(getPeriodLabel(state.currentMonth))}</dt><dd>${detailFormat(current)}</dd></div>
        ${pt ? `<div><dt>${escapeHtml(getPeriodLabel(pn))}</dt><dd>${detailFormat(previous)}</dd></div>
        <div class="kpi-comparison-difference"><dt>Diferença</dt><dd>${difference > 0 ? "+" : difference < 0 ? "−" : ""}${detailFormat(Math.abs(difference))}</dd></div>`
        : "<div><dt>Comparação</dt><dd>Sem mês anterior disponível</dd></div>"}
      </dl>
      ${context ? `<p>${escapeHtml(context)}</p>` : ""}
      ${allocatedReturns ? "<p>Devoluções proporcionais às vendas no recorte de dias.</p>" : ""}
    </div>`;
    return `<article class="kpi-card ${cls}" tabindex="0" aria-describedby="${id}"><span class="metric-icon ${color}">${appIcon(icon)}</span><div class="kpi-body"><div class="kpi-label">${name}</div><strong class="kpi-value">${count ? detailFormat(current) : R(current)}</strong><div class="kpi-change">${change}</div></div>${tooltip}</article>`;
  };
  el.innerHTML = [
    metric("Pedidos", t.orders, pt?.orders, "orders", "blue", "kpi-card--volume", "", false, true),
    metric("Vendas brutas", t.gross, pt?.gross, "money", "green", "kpi-card--gross", "Soma das vendas antes das devoluções"),
    metric("Devoluções", t.totalRet, pt?.totalRet, "returns", "red", "kpi-card--returns", "", true),
    metric("Vendas após devoluções", t.net, pt?.net, "report", "blue", "kpi-card--net", "Bruto menos devoluções. Não desconta taxas ou custos"),
    metric("Ticket médio", t.orders > 0 ? t.gross / t.orders : 0, pt?.orders > 0 ? pt.gross / pt.orders : 0, "ticket", "purple", "kpi-card--ticket", "Vendas brutas divididas pelo número de pedidos")
  ].join("");
}

/* ═══ TENDÊNCIA DO OVERVIEW ═══ */
function renderOverviewTrend() {
  const canvas = document.getElementById("overviewTrendChart");
  const summary = document.getElementById("overviewTrendSummary");
  if (!canvas) return;

  const selected = parsePeriodKey(state.currentMonth);
  const monthIndex = ALL_MONTHS.indexOf(selected.month);
  if (monthIndex < 0) return;
  const lastLoggedDay = getLastLoggedDay(state.currentMonth);
  const today = new Date();
  const isCurrentMonth = selected.year === today.getFullYear() && monthIndex === today.getMonth();
  const dailyValues = [];

  if (overviewTrendPeriod === "month") {
    const endDay = isCurrentMonth ? today.getDate() : (lastLoggedDay || getMonthDays(state.currentMonth));
    for (let day = 1; day <= endDay; day += 1) {
      const date = new Date(selected.year, monthIndex, day);
      dailyValues.push(getOverviewTrendDay(date));
    }
  } else {
    const anchorDay = isCurrentMonth ? today.getDate() : (lastLoggedDay || getMonthDays(state.currentMonth));
    const endDate = new Date(selected.year, monthIndex, anchorDay);
    for (let offset = 29; offset >= 0; offset--) {
      const date = new Date(endDate);
      date.setDate(endDate.getDate() - offset);
      dailyValues.push(getOverviewTrendDay(date));
    }
  }

  const bucketSize = Math.max(1, Number(overviewTrendBucketDays) || 1);
  const effectiveBucketSize = overviewTrendPeriod === "month" && bucketSize === 30 ? dailyValues.length : bucketSize;
  const grouped = [];
  for (let start = 0; start < dailyValues.length; start += effectiveBucketSize) {
    const bucket = dailyValues.slice(start, start + effectiveBucketSize);
    const first = bucket[0].label;
    const last = bucket[bucket.length - 1].label;
    grouped.push({
      label: overviewTrendPeriod === "month" && bucketSize === 30 ? getPeriodLabel(state.currentMonth) : bucketSize === 1 ? first : `${first}–${last}`,
      value: bucket.reduce((total, item) => total + item.gross, 0),
      previous: bucket.reduce((total, item) => {
        const prior = new Date(item.date);
        if (overviewTrendPeriod === "month") {
          const day = prior.getDate(); prior.setDate(1); prior.setMonth(prior.getMonth() - 1);
          const last = new Date(prior.getFullYear(), prior.getMonth() + 1, 0).getDate();
          if (day > last) return total;
          prior.setDate(day);
        } else prior.setDate(prior.getDate() - 30);
        const period = `${prior.getFullYear()}-${ALL_MONTHS[prior.getMonth()]}`;
        return state.db[period] ? (total ?? 0) + getOverviewTrendDay(prior).gross : total;
      }, null)
    });
  }

  document.querySelectorAll("[data-overview-trend-period]").forEach((button) => {
    const active = button.dataset.overviewTrendPeriod === overviewTrendPeriod;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-overview-trend-range]").forEach((button) => {
    const active = Number(button.dataset.overviewTrendRange) === bucketSize;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  const periodLabel = overviewTrendPeriod === "month" ? `Mês selecionado · ${getPeriodLabel(state.currentMonth)}` : "30 dias corridos";
  const subtitle = document.getElementById("overviewTrendSubtitle");
  if (subtitle) subtitle.textContent = `Vendas brutas · ${periodLabel}`;
  if (summary) {
    const total = dailyValues.reduce((sum, item) => sum + item.gross, 0);
    const dateDescription = overviewTrendPeriod === "month"
      ? `${getPeriodLabel(state.currentMonth)} até ${dailyValues.at(-1)?.label || ""}`
      : `30 dias corridos até ${dailyValues.at(-1)?.label || ""}`;
    summary.innerHTML = `<span>Vendas brutas no período</span><strong>${RS(total)}</strong><small>${dateDescription}</small>`;
  }

  if (typeof Chart === "undefined") return;
  const css = getComputedStyle(document.body);
  const gridColor = css.getPropertyValue("--border").trim() || "rgba(128,128,128,.18)";
  const mutedColor = css.getPropertyValue("--muted").trim() || "#86868b";
  const accentColor = css.getPropertyValue("--accent").trim() || "#e8ff47";
  const config = {
    type: "bar",
    data: {
      labels: grouped.map((item) => item.label),
      datasets: [{
        label: "Vendas brutas",
        data: grouped.map((item) => item.value),
        borderColor: accentColor,
        backgroundColor: `${accentColor}cc`,
        borderWidth: 0,
        borderRadius: 3,
        maxBarThickness: 15,
        tension: 0.32,
        fill: true,
        pointRadius: 2,
        pointHoverRadius: 4,
        pointBackgroundColor: accentColor,
        pointBorderColor: accentColor
      }, ...(grouped.some(item => item.previous !== null) ? [{ type: "line", label: "Período anterior", data: grouped.map(item => item.previous), borderColor: mutedColor, borderDash: [5, 5], borderWidth: 2, pointRadius: 2, tension: .25, fill: false }] : [])]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: grouped.some(item => item.previous !== null), labels: { color: mutedColor, usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${R(Number(item.raw || 0))}` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: mutedColor, maxTicksLimit: bucketSize === 1 ? 10 : 8, maxRotation: 0 }, border: { display: false } },
        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: mutedColor, callback: (value) => Number(value) >= 1000 ? `R$ ${(Number(value) / 1000).toLocaleString("pt-BR")}k` : `R$ ${Number(value).toLocaleString("pt-BR")}` }, border: { display: false } }
      }
    }
  };
  if (overviewTrendChart) {
    overviewTrendChart.data = config.data;
    overviewTrendChart.options = config.options;
    overviewTrendChart.update("none");
  } else overviewTrendChart = new Chart(canvas.getContext("2d"), config);
}

function getOverviewTrendDay(date) {
    const monthName = ALL_MONTHS[date.getMonth()];
    const periodKey = `${date.getFullYear()}-${monthName}`;
    const monthData = state.db[periodKey]
      || Object.entries(state.db).find(([key]) => {
        const parsed = parsePeriodKey(key);
        return parsed.year === date.getFullYear() && parsed.month === monthName;
      })?.[1];
    const dayLabel = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
    const row = monthData?.days?.find((item) => item.d === dayLabel);
    const gross = row
      ? state.platforms.reduce((total, platform) => total + Number(row[platform.key] || 0), 0)
      : 0;
    return { date, label: dayLabel, gross };
}

/* ═══ HEADER DO CARD (eyebrow + total + delta) ═══ */
function renderDailyHeader() {
  const eyebrow = document.getElementById("dailyCardEyebrow");
  const totalEl = document.getElementById("dailyCardTotal");
  const deltaEl = document.getElementById("dailyCardDelta");
  if (!eyebrow || !totalEl || !deltaEl) return;

  const comp = getComparisonPeriod(state.currentMonth);
  const t = comp.currentTotals;
  const pt = comp.previousTotals;

  // Eyebrow: "VENDAS DIÁRIAS · SETEMBRO 2026"
  const monthLabel = getPeriodLabel(state.currentMonth).toUpperCase();
  eyebrow.textContent = `VENDAS DIÁRIAS · ${monthLabel}`;

  // Total do mês (soma dos dados visíveis, respeitando o filtro)
  const visibleSales = (selectedPlatformKeys || [])
    .reduce((s, k) => s + Number(t?.sales?.[k] || 0), 0);

  totalEl.textContent = R(visibleSales);

  // Delta vs. mês anterior
  deltaEl.className = "daily-card-delta";
  if (pt) {
    const prevSales = (selectedPlatformKeys || [])
      .reduce((s, k) => s + Number(pt?.sales?.[k] || 0), 0);

    if (prevSales > 0) {
      const diff = ((visibleSales - prevSales) / prevSales) * 100;
      const cls = diff > 0 ? "up" : diff < 0 ? "down" : "neutral";
      const arrow = diff > 0 ? "↑" : diff < 0 ? "↓" : "→";
      deltaEl.classList.add(cls);
      deltaEl.textContent = `${arrow} ${Math.abs(diff).toFixed(1)}% vs ${getPeriodLabel(comp.previousName)}`;
    } else {
      deltaEl.textContent = "Sem base de comparação";
    }
  } else {
    deltaEl.textContent = "Primeiro mês";
  }
}

/* ═══ CHIPS DE FILTRO POR PLATAFORMA ═══ */
function renderDailyPlatformChips(platforms) {
  const el = document.getElementById("dailyPlatformChips");
  if (!el) return;

  if (!platforms.length) {
    el.innerHTML = "";
    return;
  }

  const selectedSet = new Set(selectedPlatformKeys || []);
  const allSelected = platforms.every((p) => selectedSet.has(p.key));

  el.innerHTML = `
    ${platforms.map((p) => {
      const active = selectedSet.has(p.key);
      return `
        <button class="daily-platform-chip ${active ? "is-active" : "is-inactive"}"
                type="button"
                data-chip-platform="${escapeAttribute(p.key)}"
                aria-pressed="${active}">
          ${platformIcon(p)}
          <span>${escapeHtml(p.name)}</span>
        </button>
      `;
    }).join("")}
    <button class="daily-platform-chip-action" type="button" id="dailyChipsToggleAll">
      ${allSelected ? "Limpar" : "Selecionar todas"}
    </button>
  `;
}

/* ═══ LEGENDA CUSTOMIZADA ═══ */
function renderDailyChartLegend(platforms) {
  const el = document.getElementById("dailyChartLegend");
  if (!el) return;

  if (!platforms.length) {
    el.innerHTML = "";
    return;
  }

  const selectedSet = new Set(selectedPlatformKeys || []);

  el.innerHTML = platforms.map((p) => {
    const active = selectedSet.has(p.key);
    return `
      <button class="daily-chart-legend-item ${active ? "" : "is-inactive"}"
              type="button"
              aria-pressed="${active}"
              data-legend-platform="${escapeAttribute(p.key)}">
        <span class="daily-chart-legend-dot" style="background:${getPlatformVisualColor(p)}"></span>
        <span>${escapeHtml(p.name)}</span>
      </button>
    `;
  }).join("");
}

/* ═══ DAILY CHART ═══ */
function renderDailyChart() {
  const data = state.db[state.currentMonth];
  const c = document.getElementById("dailyChart");
  if (!c || !data || !window.Chart) return;

  // ⬇️ Mostra skeleton antes de desenhar
  showChartSkeleton("dailyChart");

  // ─── Inicializa filtro: começa com todas as plataformas ativas ───
  const allPlatforms = state.platforms || [];
  const platformsWithData = allPlatforms.filter((p) =>
    data.days.some((d) => Number(d[p.key] || 0) > 0)
  );

  if (selectedPlatformKeys === null) {
    selectedPlatformKeys = platformsWithData.map((p) => p.key);
  } else {
    // Remove keys que não existem mais
    const validKeys = new Set(allPlatforms.map((p) => p.key));
    selectedPlatformKeys = selectedPlatformKeys.filter((k) => validKeys.has(k));
  }

  const active = platformsWithData.filter((p) =>
    selectedPlatformKeys.includes(p.key)
  );

  // ─── Atualiza header (eyebrow + total + delta) ───
  renderDailyHeader();

  // ─── Atualiza chips ───
  renderDailyPlatformChips(platformsWithData);

  // ─── Sem dados para mostrar? ───
  const ctx = c.getContext("2d");


  if (!platformsWithData.length || !data.days.length) {
    if (dailyChart) { dailyChart.destroy(); dailyChart = null; }
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    renderDailyChartLegend([]);
    hideChartSkeleton("dailyChart");
    return;
  }

  // ─── Ordem: maiores embaixo ───
  const totals = {};
  active.forEach((p) => {
    totals[p.key] = data.days.reduce((s, d) => s + Number(d[p.key] || 0), 0);
  });
  const sorted = [...active].sort((a, b) => totals[b.key] - totals[a.key]);

  // ─── Detecta qual plataforma está no topo em cada dia ───
  // Assim aplicamos borderRadius só no segmento mais alto daquela barra.
  const topPlatformByDay = data.days.map((d) => {
    let topKey = null;
    let topValue = -1;
    // percorre da última para a primeira (a mais "de cima" no stack)
    for (let i = sorted.length - 1; i >= 0; i--) {
      const v = Number(d[sorted[i].key] || 0);
      if (v > 0 && (topKey === null || sorted.indexOf(sorted[i]) > sorted.indexOf(
        sorted.find((pp) => pp.key === topKey) || sorted[i]
      ))) {
        // verificação simples: escolhe a última com valor > 0
        topKey = sorted[i].key;
        topValue = v;
        break;
      }
    }
    return topKey;
  });

  // ─── Datasets das barras ───
  const barDatasets = sorted.map((p) => {
    const color = getPlatformVisualColor(p);
    return {
      label: p.name,
      data: data.days.map((d) => Number(d[p.key] || 0)),
      backgroundColor: alphaColor(color, 0.88),
      hoverBackgroundColor: color,
      borderColor: "transparent",
      borderWidth: 0,
      borderRadius: 0, // arredondamento aplicado via scriptable abaixo
      borderSkipped: false,
      barPercentage: 0.76,
      categoryPercentage: 0.88,
      stack: "current",
      // Arredonda só o topo no dia em que essa plataforma está no topo
      borderRadiusScriptable: true
    };
  });

  // Aplica borderRadius por dia (scriptable por contexto)
  barDatasets.forEach((ds, dsIdx) => {
    const platformKey = sorted[dsIdx].key;
    ds.borderRadius = (ctx) => {
      const dayKey = topPlatformByDay[ctx.dataIndex];
      if (dayKey === platformKey && Number(ctx.raw || 0) > 0) {
        return { topLeft: 3, topRight: 3, bottomLeft: 0, bottomRight: 0 };
      }
      return 0;
    };
  });

  // ─── Dataset de comparação (linha) ───
  const compareDatasets = [];
  const compareData = state.db[compareMonthKey];

  if (compareMonthKey && compareData) {
    const compareByDay = new Map();
    compareData.days.forEach((d) => {
      const day = Number(String(d.d || "").split("/")[0]);
      if (!day) return;
      // Considera apenas as plataformas visíveis no filtro
      const total = active.reduce((s, p) => s + Number(d[p.key] || 0), 0);
      compareByDay.set(day, total);
    });

    const aligned = data.days.map((d) => {
      const day = Number(String(d.d || "").split("/")[0]);
      const value = compareByDay.get(day);
      return value !== undefined ? value : null;
    });

    compareDatasets.push({
      type: "line",
      label: `Comparação: ${getPeriodLabel(compareMonthKey)}`,
      data: aligned,
      stack: "compare",
      borderColor: "#ff3b30",
      backgroundColor: "transparent",
      borderWidth: 2,
      borderDash: [5, 4],
      pointRadius: 2.5,
      pointHoverRadius: 4,
      pointBackgroundColor: "#ff3b30",
      pointBorderColor: "transparent",
      tension: 0.3,
      fill: false,
      spanGaps: true,
      order: 1
    });
  }

  renderCompareLegend();

  // ─── Cor da gridline dinâmica (respeita tema) ───
  const css = getComputedStyle(document.body);
  const gridColor = css.getPropertyValue("--border").trim() || "rgba(0,0,0,0.06)";
  const mutedColor = css.getPropertyValue("--muted-2").trim() || "#6e6e73";

  const config = {
    type: "bar",
    data: {
      labels: data.days.map((d) => d.d),
      datasets: [...barDatasets, ...compareDatasets]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 8, right: 8, left: 0, bottom: 0 } },
      plugins: {
        legend: { display: false }, // legenda customizada via HTML
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
              if (value === 0 || value === null || Number.isNaN(value)) return null;

              if (item.dataset.type === "line") {
                return ` ${item.dataset.label}: ${R(value)}`;
              }

              const total = item.chart.data.datasets
                .filter((ds) => ds.type !== "line")
                .reduce((s, ds) => s + Number(ds.data[item.dataIndex] || 0), 0);
              const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
              return ` ${item.dataset.label}: ${R(value)} (${pct}%)`;
            },
            footer: (items) => {
              if (!items.length) return "";
              const currentTotal = items
                .filter((i) => i.dataset.type !== "line")
                .reduce((s, i) => s + Number(i.raw || 0), 0);
              const compareItem = items.find((i) => i.dataset.type === "line");
              const compareTotal = compareItem ? Number(compareItem.raw || 0) : null;

              const lines = [`Atual: ${R(currentTotal)}`];
              if (compareTotal !== null && !Number.isNaN(compareTotal)) {
                const diff = compareTotal > 0
                  ? ((currentTotal - compareTotal) / compareTotal) * 100
                  : 0;
                const arrow = diff >= 0 ? "↑" : "↓";
                const sign = diff >= 0 ? "+" : "";
                lines.push(`Comparação: ${R(compareTotal)} (${sign}${diff.toFixed(1)}% ${arrow})`);
              }
              return lines;
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          ticks: {
            color: mutedColor,
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
            color: mutedColor,
            font: { size: 10, family: "inherit" },
            padding: 8,
            maxTicksLimit: 4,
            callback: (v) => {
              const n = Number(v);
              if (n === 0) return "0";
              if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
              return String(n);
            }
          },
          grid: {
            color: gridColor,
            drawTicks: false,
            drawBorder: false,
            lineWidth: 0.7
          },
          border: { display: false }
        }
      }
    }
  };
  if (dailyChart) {
    dailyChart.data = config.data;
    dailyChart.options = config.options;
    dailyChart.update("none");
  } else dailyChart = new Chart(ctx, config);

  // ─── Legenda HTML ───
  renderDailyChartLegend(sorted);

   // No FINAL da função (depois do new Chart), adicione:
  requestAnimationFrame(() => hideChartSkeleton("dailyChart"));
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
      return `<td><input class="ceditable finput" type="text" inputmode="decimal" aria-label="${escapeAttribute(p.name)} vendas em ${escapeAttribute(d.d)}" data-day-index="${di}" data-platform-key="${escapeAttribute(p.key)}" value="${v.toFixed(2)}"></td>` +
        `<td><input class="ceditable finput" type="number" inputmode="numeric" min="0" step="1" aria-label="${escapeAttribute(p.name)} pedidos em ${escapeAttribute(d.d)}" data-day-index="${di}" data-platform-key="orders_${escapeAttribute(p.key)}" value="${ov}"></td>`;
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

   // Se ainda não tem dados, mostra skeleton
  const hasData = Object.values(totals.sales || {}).some((v) => Number(v) > 0);
  if (!hasData) {
    c.innerHTML = '<div class="empty-state"><p>Ainda não há vendas neste mês.</p><button type="button" class="btn btn-primary" data-dashboard-tab="entries">Registrar vendas</button><button type="button" class="btn btn-secondary" data-open-sales-import>Importar planilha</button></div>';
    return;
  }

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

  c.innerHTML = `
    <div class="marketplace-list">${rows.map(({ platform, gross, returns, net }) => {
    const wp = max > 0 ? (net / max) * 100 : 0;
    const returnRate = gross > 0 ? (returns / gross) * 100 : 0;
    return `
      <div class="marketplace-item" title="Vendas brutas: ${R(gross)} · Devoluções: ${R(returns)} (${returnRate.toFixed(1)}%)">${platformIcon(platform)}<div class="marketplace-data"><div><span>${escapeHtml(platform.name)}</span><strong>${R(net)}</strong></div><div class="marketplace-track"><span><i style="width:${wp.toFixed(1)}%;background:${getPlatformVisualColor(platform)}"></i></span><small>${totals.net > 0 ? (net / totals.net * 100).toFixed(1) : "0,0"}%</small></div></div></div>
    `;
  }).join("")}</div>
    <p class="marketplace-note">Vendas após devoluções · total ${R(totalGross - totalReturns)}</p>
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
let inputSignature = "";
let inputOwner = "";
let undoEntry = null;
const draftKey = () => `kanri-sales-draft:${state.auth?.username || ""}`;

export function renderSaleInputs() {
  const el = document.getElementById("saleInputs");
  if (!el) return;
  const signature = JSON.stringify([state.auth?.username, state.platforms.filter(p => !p.archived)]);
  if (signature === inputSignature) return;
  if (inputOwner !== state.auth?.username) {
    document.getElementById("inputDate").value = "";
    document.getElementById("saleEntryMode").value = "add";
    inputOwner = state.auth?.username;
  }
  inputSignature = signature;
  undoEntry = null;
  document.getElementById("undoSaleButton").hidden = true;
  document.getElementById("undoDailyEntryButton").hidden = true;
  el.innerHTML = '<div class="sales-column-labels" aria-hidden="true"><span>Plataforma</span><span>Vendas (R$)</span><span>Pedidos</span></div>' + state.platforms.filter(p => !p.archived).map(p => `
    <div class="sale-platform-row">
      <div class="sale-platform-name">${platformBadge(p)}</div>
      <div class="fg"><label class="flabel" for="sale_${escapeAttribute(p.key)}">Vendas (R$)</label>
      <input type="text" inputmode="decimal" class="finput" id="sale_${escapeAttribute(p.key)}" placeholder="0,00" aria-describedby="saleEntryError"></div>
      <div class="fg"><label class="flabel" for="orders_${escapeAttribute(p.key)}">Pedidos</label>
      <input type="number" inputmode="numeric" class="finput" id="orders_${escapeAttribute(p.key)}" placeholder="0" step="1" min="0" aria-describedby="saleEntryError"></div>
    </div>`).join("");
  try {
    const draft = JSON.parse(sessionStorage.getItem(draftKey()) || "{}");
    for (const [id, value] of Object.entries(draft)) {
      const input = document.getElementById(id);
      if (input && (id.startsWith("sale_") || id.startsWith("orders_") || ["inputDate", "inputMonth", "saleEntryMode"].includes(id))) input.value = value;
    }
  } catch {}
}

function persistSaleDraft() {
  const draft = {};
  document.querySelectorAll("#saleInputs input, #inputDate, #inputMonth, #saleEntryMode").forEach(input => { draft[input.id] = input.value; });
  sessionStorage.setItem(draftKey(), JSON.stringify(draft));
  renderEntryPreview();
}

function getEntryChanges() {
  const changes = {};
  for (const p of state.platforms.filter(p => !p.archived)) {
    for (const [id, key, orders] of [[`sale_${p.key}`, p.key, false], [`orders_${p.key}`, `orders_${p.key}`, true]]) {
      const input = document.getElementById(id);
      input?.removeAttribute("aria-invalid");
      if (!input?.value.trim()) continue;
      const value = orders ? Number(input.value) : parseMoney(input.value);
      if (!Number.isFinite(value) || value < 0 || (orders && !Number.isInteger(value))) {
        input.setAttribute("aria-invalid", "true");
        throw new Error(`${p.name}: informe ${orders ? "uma quantidade inteira de pedidos" : "um valor válido, como 1.234,56"}, maior ou igual a zero.`);
      }
      changes[key] = value;
    }
  }
  return changes;
}

function renderEntryPreview() {
  const el = document.getElementById("saleEntryPreview");
  const error = document.getElementById("saleEntryError");
  if (!el || !error) return;
  error.hidden = true;
  try {
    const date = document.getElementById("inputDate").value.split("-");
    const month = document.getElementById("inputMonth").value;
    const existing = state.db[month]?.days?.find(day => day.d === `${date[2]}/${date[1]}`) || {};
    const changes = getEntryChanges();
    const adding = document.getElementById("saleEntryMode").value === "add";
    const active = state.platforms.filter(p => !p.archived);
    const result = key => key in changes ? (adding ? Number(existing[key] || 0) : 0) + changes[key] : Number(existing[key] || 0);
    el.innerHTML = `<table><thead><tr><th>Plataforma</th><th>Atual</th><th>Após lançamento</th></tr></thead><tbody>${active.map(p => `<tr><td>${platformBadge(p)}</td><td>${R(Number(existing[p.key] || 0))}</td><td><strong>${R(result(p.key))}</strong></td></tr>`).join("")}</tbody></table><div class="entry-summary"><div><span>Total de vendas do dia</span><strong>${R(active.reduce((sum, p) => sum + result(p.key), 0))}</strong></div><div><span>Pedidos do dia</span><strong>${active.reduce((sum, p) => sum + result(`orders_${p.key}`), 0)}</strong></div></div>${Object.keys(changes).length ? "" : '<p class="card-sub">Preencha vendas ou pedidos para conferir o resultado antes de registrar.</p>'}`;
  } catch (err) { error.textContent = err.message; error.hidden = false; el.replaceChildren(); }
}

/* ═══ TABS / PERÍODO ═══ */
export function renderTabs() {
  const am = sortPeriodKeys([...new Set([...getAvailablePeriods(), state.currentMonth])]);
  const combined = document.getElementById("dashboardPeriodSelect");
  if (combined) { combined.innerHTML = am.map(period => `<option value="${escapeAttribute(period)}">${escapeHtml(getPeriodLabel(period))}</option>`).join(""); combined.value = state.currentMonth; }
  const cy = getPeriodYear(state.currentMonth);
  const ys = [...new Set(am.map(getPeriodYear))].sort((a, b) => a - b);

  const yearSelect = document.getElementById("dashboardYearSelect");
  const monthSelect = document.getElementById("dashboardMonthSelect");
  const sidebarYear = document.getElementById("sidebarCurrentYear");
  const sidebarMonth = document.getElementById("sidebarCurrentMonth");
  if (sidebarYear) sidebarYear.textContent = String(cy);
  if (sidebarMonth) sidebarMonth.textContent = getPeriodMonth(state.currentMonth);
  if (yearSelect) {
    yearSelect.innerHTML = ys.map((year) => `<option value="${year}">${year}</option>`).join("");
    yearSelect.value = String(cy);
  }
  if (monthSelect) {
    const availableMonths = am.filter((period) => getPeriodYear(period) === cy);
    monthSelect.innerHTML = availableMonths.map((period) =>
      `<option value="${escapeAttribute(getPeriodMonth(period))}">${escapeHtml(getPeriodMonth(period))}</option>`
    ).join("");
    monthSelect.value = getPeriodMonth(state.currentMonth);
  }

  const opts = ys.map((y) => {
    const yo = am.filter((m) => getPeriodYear(m) === y)
      .map((m) => `<option value="${m}"${m === state.currentMonth ? " selected" : ""}>${getPeriodLabel(m)}</option>`)
      .join("");
    return `<optgroup label="${y}">${yo}</optgroup>`;
  }).join("");

  ["inputMonth", "returnMonth"].forEach((id) => {
    const el = document.getElementById(id);
    const previous = el?.value;
    if (el) { el.innerHTML = opts; if (am.includes(previous)) el.value = previous; }
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
  const prefix = `${p.year}-${String(mi + 1).padStart(2, "0")}-`;
  di.min = `${prefix}01`;
  di.max = `${prefix}${getMonthDays(m)}`;
  if (!di.value.startsWith(prefix)) di.value = suggested;
  renderEntryPreview();
}

export async function switchMonth(month) {
  try { await window.dashboard.ensurePeriod(month); } catch (error) { toastError(error.message); return; }
  state.currentMonth = month;
  saveNavigation();
  renderTabs();
  const im = document.getElementById("inputMonth");
  if (im) im.value = month;
  syncDateWithMonth();
  renderAll();
  window.dispatchEvent(new CustomEvent("dashboard:period-changed"));
}

export function switchDashboardPeriod(year, month) {
  const period = `${Number(year)}-${month}`;
  if (!getAvailablePeriods().includes(period)) return;
  return switchMonth(period);
}

/* ═══ MODAL DE MÊS ═══ */
export function openAddMonth() {
  newMonthSel = null;
  const cy = getPeriodYear(state.currentMonth);
  const yi = document.getElementById("periodYearInput");
  if (yi) yi.value = cy;
  refreshMonthPickerForYear();
  const m = document.getElementById("addMonthModal");
  if (m) openModal("addMonthModal");
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
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return toastError("Informe um ano entre 2000 e 2100.");
  const period = `${year}-${newMonthSel}`;
  if (!state.db[period]) state.db[period] = { days: [], returns: {} };
  state.currentMonth = period;
  saveState();
  closeModal("addMonthModal");
  renderTabs();
  renderAll();
  toastSuccess(`${getPeriodLabel(period)} criado`);
  window.dispatchEvent(new CustomEvent("dashboard:period-changed"));
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
  document.getElementById("overviewTrendGrouping")?.addEventListener("change", event => { overviewTrendBucketDays = Number(event.target.value) || 1; renderOverviewTrend(); });
  document.getElementById("dashboard-panel-overview")?.addEventListener("click", (event) => {
    const periodButton = event.target.closest("[data-overview-trend-period]");
    if (periodButton) {
      overviewTrendPeriod = periodButton.dataset.overviewTrendPeriod === "month" ? "month" : "rolling30";
      renderOverviewTrend();
      return;
    }
    const button = event.target.closest("[data-overview-trend-range]");
    if (!button) return;
    overviewTrendBucketDays = Number(button.dataset.overviewTrendRange) || 1;
    renderOverviewTrend();
  });

  const compareSel = document.getElementById("dailyCompareMonth");
  if (compareSel) {
    compareSel.addEventListener("change", async (e) => {
      const requested = e.target.value;
      try { if (requested) await window.dashboard.ensureHistory([requested]); } catch (error) { toastError(error.message); return; }
      compareMonthKey = requested;
      renderDailyChart();
    });
  }
  
   const chips = document.getElementById("dailyPlatformChips");
  if (chips) {
    chips.addEventListener("click", (e) => {
      const toggleAll = e.target.closest("#dailyChipsToggleAll");
      if (toggleAll) {
        const allKeys = (state.platforms || [])
          .filter((p) => state.db[state.currentMonth]?.days?.some(
            (d) => Number(d[p.key] || 0) > 0
          ))
          .map((p) => p.key);

        const allSelected = allKeys.every((k) => selectedPlatformKeys.includes(k));
        selectedPlatformKeys = allSelected ? [] : allKeys;
        renderDailyChart();
        return;
      }

      const chip = e.target.closest("[data-chip-platform]");
      if (!chip) return;

      const key = chip.dataset.chipPlatform;
      const set = new Set(selectedPlatformKeys || []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      selectedPlatformKeys = [...set];
      renderDailyChart();
    });
  }

  // ⬇️ NOVO: clique na legenda alterna visibilidade também
  const legend = document.getElementById("dailyChartLegend");
  if (legend) {
    legend.addEventListener("click", (e) => {
      const item = e.target.closest("[data-legend-platform]");
      if (!item) return;
      const key = item.dataset.legendPlatform;
      const set = new Set(selectedPlatformKeys || []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      selectedPlatformKeys = [...set];
      renderDailyChart();
    });
  }

  document.getElementById("inputMonth")?.addEventListener("change", async () => {
    const month = document.getElementById("inputMonth").value;
    try { await window.dashboard.ensureHistory([month]); syncDateWithMonth(); persistSaleDraft(); } catch (error) { toastError(error.message); }
  });

  document.querySelectorAll(".itab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".itab").forEach((b) => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".ipanel").forEach((p) =>
        p.classList.toggle("active", p.id === `panel-${btn.dataset.tab}`)
      );
    });
  });

  document.querySelectorAll("#saleInputs, #inputDate, #inputMonth, #saleEntryMode").forEach(el => {
    el.addEventListener("input", persistSaleDraft);
    el.addEventListener("change", persistSaleDraft);
  });
  document.getElementById("undoSaleButton")?.addEventListener("click", undoLastEntry);
  document.getElementById("undoDailyEntryButton")?.addEventListener("click", undoLastEntry);
  document.getElementById("registerSaleButton")?.addEventListener("click", addSale);
  document.getElementById("clearSaleButton")?.addEventListener("click", clearSale);
  document.getElementById("openDailyDetailsButton")
    ?.addEventListener("click", () => { renderDailyTable(); openModal("dailyDetailsModal"); });

  const dt = document.getElementById("dailyDetailsTable");
  if (dt) {
    dt.addEventListener("focusin", (e) => {
      const cell = e.target.closest(".ceditable");
      if (!cell) return;
      cell.dataset.originalValue = cell.value;
      cell.select();
    });
    dt.addEventListener("keydown", event => {
      const cell = event.target.closest(".ceditable");
      if (!cell) return;
      if (event.key === "Escape" && cell.value !== cell.dataset.originalValue) { event.preventDefault(); event.stopPropagation(); cell.value = cell.dataset.originalValue; cell.blur(); }
      if (event.key === "Enter") { event.preventDefault(); cell.blur(); }
    });
    dt.addEventListener("blur", (e) => {
      const cell = e.target.closest(".ceditable");
      if (!cell) return;
      updateCell(Number(cell.dataset.dayIndex), cell.dataset.platformKey, cell);
    }, true);
  }
}

async function addSale() {
  const button = document.getElementById("registerSaleButton");
  if (button.disabled) return;
  button.disabled = true;
  try {
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

  try { await window.dashboard.ensureHistory([month]); } catch (error) { return toastError(error.message); }
  if (!state.db[month]) state.db[month] = { days: [], returns: {} };
  const label = `${parts[2]}/${parts[1]}`;
  let changes;
  try { changes = getEntryChanges(); } catch (error) { renderEntryPreview(); return toastError(error.message); }
  if (!Object.keys(changes).length) return toastError("Preencha ao menos um valor ou quantidade de pedidos");
  const ei = state.db[month].days.findIndex(d => d.d === label);
  const before = ei >= 0 ? structuredClone(state.db[month].days[ei]) : null;
  const entry = before ? { ...before } : { d: label };
  const adding = document.getElementById("saleEntryMode").value === "add";
  for (const [key, value] of Object.entries(changes)) entry[key] = adding ? Math.round((Number(entry[key] || 0) + value) * 100) / 100 : value;
  if (ei >= 0) state.db[month].days[ei] = entry;
  else state.db[month].days.push(entry);
  state.db[month].days.sort((a, b) => Number(a.d.slice(0, 2)) - Number(b.d.slice(0, 2)));
  undoEntry = { owner: state.auth?.username, month, label, before, after: structuredClone(entry) };
  document.getElementById("undoSaleButton").hidden = false;
  document.getElementById("undoDailyEntryButton").hidden = false;

  saveState();
  if (month === state.currentMonth) renderAll();
  clearSale();
  toastSuccess(`Vendas registradas em ${getPeriodLabel(month)}`);
  } finally { button.disabled = false; }
}

function undoLastEntry() {
  if (!undoEntry || undoEntry.owner !== state.auth?.username) return;
  const { month, label, before, after } = undoEntry;
  const days = state.db[month]?.days;
  const index = days?.findIndex(day => day.d === label);
  if (index === undefined || index < 0 || JSON.stringify(days[index]) !== JSON.stringify(after)) return toastError("Esse lançamento mudou desde a última edição. Confira os valores antes de alterar.");
  if (before) days[index] = before;
  else days.splice(index, 1);
  undoEntry = null;
  document.getElementById("undoSaleButton").hidden = true;
  document.getElementById("undoDailyEntryButton").hidden = true;
  saveState(); renderAll(); renderEntryPreview(); toastSuccess("Alteração desfeita");
}

function clearSale() {
  state.platforms.forEach((p) => {
    const e = document.getElementById(`sale_${p.key}`);
    if (e) e.value = "";
    const o = document.getElementById(`orders_${p.key}`);
    if (o) o.value = "";
  });
  persistSaleDraft();
}

function updateCell(di, key, el) {
  const rv = parseMoney(el.value ?? el.textContent);
  if (!Number.isFinite(rv) || rv < 0) {
    el.setAttribute("aria-invalid", "true");
    toastError("Informe um valor válido, como 1.234,56, maior ou igual a zero.");
    return;
  }
  const isOrder = key === "orders" || key.startsWith("orders_");
  if (isOrder && !Number.isInteger(rv)) return toastError("Informe uma quantidade inteira de pedidos.");
  const v = isOrder ? Math.max(0, Math.round(rv)) : rv;
  if (Number(state.db[state.currentMonth].days[di][key] || 0) === v) return;
  el.removeAttribute("aria-invalid");
  const before = structuredClone(state.db[state.currentMonth].days[di]);
  state.db[state.currentMonth].days[di][key] = v;
  undoEntry = { owner: state.auth?.username, month: state.currentMonth, label: before.d, before, after: structuredClone(state.db[state.currentMonth].days[di]) };
  document.getElementById("undoSaleButton").hidden = false;
  document.getElementById("undoDailyEntryButton").hidden = false;
  saveState();
  renderAll();
  toastSuccess("Valor atualizado");
}

/* ═══ COMPARAR MÊS — seletor ═══ */
function renderComparePicker() {
  const sel = document.getElementById("dailyCompareMonth");
  if (!sel) return;

  const allMonths = sortPeriodKeys(Object.keys(state.db))
    .filter((m) => m !== state.currentMonth);

  // Mantém seleção se ainda existir
  if (compareMonthKey && !allMonths.includes(compareMonthKey)) {
    compareMonthKey = "";
  }

  sel.innerHTML = [
    `<option value="">— Nenhum —</option>`,
    ...allMonths.map((m) =>
      `<option value="${m}"${m === compareMonthKey ? " selected" : ""}>${getPeriodLabel(m)}</option>`
    )
  ].join("");

  sel.value = compareMonthKey;
}

function renderCompareLegend() {
  const el = document.getElementById("dailyCompareLegend");
  if (!el) return;

  if (!compareMonthKey || !state.db[compareMonthKey]) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }

  const curLabel = getPeriodLabel(state.currentMonth);
  const cmpLabel = getPeriodLabel(compareMonthKey);

  el.hidden = false;
  el.innerHTML = `
    <span class="daily-compare-legend-item">
      <span class="daily-compare-legend-dot" style="background: var(--accent)"></span>
      Barras: <strong>${escapeHtml(curLabel)}</strong>
    </span>
    <span class="daily-compare-legend-item">
      <span class="daily-compare-legend-dot dashed" style="color: var(--accent-3)"></span>
      Linha tracejada: <strong>${escapeHtml(cmpLabel)}</strong>
    </span>
  `;
}
