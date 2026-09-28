/* ═══════════════════════════════════════════════════════════════
   features/trends/trends.ui.js
   Gráfico de tendência multi-mês + tabela comparativa.
   ═══════════════════════════════════════════════════════════════ */

import { state } from "../../core/state.js";
import { RS, R, escapeHtml } from "../../core/format.js";
import { getPlatformVisualColor } from "../../ui/charts.js";
import { platformBadge } from "../../ui/icons.js";
import {
  getTrendSeries,
  computeVariation,
  formatMetricValue,
  METRICS
} from "./trends.calc.js";

let chart = null;
let bound = false;
let currentMetric = "gross";
let currentMonths = 6;

export function init() {
  render();
  if (!bound) { bindEvents(); bound = true; }
}

function render() {
  const wrap = document.getElementById("dashboard-panel-trends");
  if (!wrap) return;

  const series = getTrendSeries(state, { months: currentMonths, metric: currentMetric });

  // Sincroniza selects com o estado local
  const metricSel = document.getElementById("trendsMetric");
  const monthsSel = document.getElementById("trendsMonths");
  if (metricSel) metricSel.value = currentMetric;
  if (monthsSel) monthsSel.value = String(currentMonths);

  // Sem dados
  if (!series.periods.length || series.total.data.every((v) => v === null)) {
    destroyChart();
    const canvas = document.getElementById("trendsChart");
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    const table = document.getElementById("trendsTable");
    if (table) {
      table.innerHTML = `<div class="empty-state">Sem dados suficientes para mostrar a tendência. Lance vendas em pelo menos um mês.</div>`;
    }
    return;
  }

  renderChart(series);
  renderTable(series);
}

/* ═══ Chart ═══ */
function renderChart(series) {
  const canvas = document.getElementById("trendsChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  destroyChart();

  const css = getComputedStyle(document.body);
  const mutedColor = css.getPropertyValue("--muted").trim() || "#86868b";
  const borderColor = css.getPropertyValue("--border").trim() || "rgba(0,0,0,0.06)";

  const isTicket = series.metric === "ticket";
  const isOrders = series.metric === "orders";

  // Datasets: uma linha por plataforma + Total
  const datasets = series.platforms.map((p) => ({
    label: p.name,
    data: p.data,
    borderColor: getPlatformVisualColor(p),
    backgroundColor: "transparent",
    borderWidth: 2,
    tension: 0.35,
    spanGaps: false,          // meses sem dados ficam com lacuna
    pointRadius: 3,
    pointHoverRadius: 5,
    pointBackgroundColor: getPlatformVisualColor(p),
    pointBorderColor: "transparent",
    pointBorderWidth: 0,
    order: 2
  }));

  // Total (mais visível)
  datasets.push({
    label: "Total",
    data: series.total.data,
    borderColor: mutedColor,
    backgroundColor: "transparent",
    borderWidth: 2.5,
    borderDash: [],
    tension: 0.35,
    spanGaps: false,
    pointRadius: 4,
    pointHoverRadius: 6,
    pointBackgroundColor: mutedColor,
    pointBorderColor: "transparent",
    order: 1
  });

  // Meta como linha pontilhada (só em métrica gross e se houver metas)
  if (series.total.goal) {
    datasets.push({
      label: "Meta",
      data: series.total.goal.data,
      borderColor: css.getPropertyValue("--accent").trim() || "#0071e3",
      backgroundColor: "transparent",
      borderWidth: 2,
      borderDash: [6, 4],
      tension: 0,
      spanGaps: true,
      pointRadius: 0,
      pointHoverRadius: 0,
      order: 0
    });
  }

  // Mês atual: marcamos com um "pointStyle" diferente
  // Como o Chart.js não suporta por-ponto facilmente, usamos o callback de tooltip
  // + a tabela abaixo para sinalizar.

  chart = new Chart(ctx, {
    type: "line",
    data: { labels: series.labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 8, right: 12, left: 0, bottom: 0 } },
      plugins: {
        legend: {
          position: "bottom",
          align: "start",
          labels: {
            color: mutedColor,
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
            title: (items) => {
              const i = items[0].dataIndex;
              const partial = series.isPartial[i] ? " (mês em andamento)" : "";
              return items[0].label + partial;
            },
            label: (item) => {
              const v = item.raw;
              if (v === null || v === undefined) return ` ${item.dataset.label}: sem dados`;
              return ` ${item.dataset.label}: ${formatMetricValue(v, series.metric)}`;
            }
          }
        }
      },
      scales: {
        x: {
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
          beginAtZero: true,
          ticks: {
            color: mutedColor,
            font: { size: 10, family: "inherit" },
            padding: 8,
            maxTicksLimit: 5,
            callback: (v) => formatTick(v, series.metric)
          },
          grid: {
            color: borderColor,
            drawTicks: false,
            drawBorder: false,
            lineWidth: 1
          },
          border: { display: false }
        }
      }
    }
  });

  // Marca visualmente o mês atual como tracejado (só o último segmento)
  // Não é suportado nativamente pelo Chart.js, então aplicamos via plugin simples
  applyPartialIndicator(series);
}

function formatTick(v, metric) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  if (metric === "orders") return String(Math.round(n));
  if (Math.abs(n) >= 1000) {
    const k = n / 1000;
    return `${k.toFixed(k % 1 === 0 ? 0 : 1)}k`;
  }
  return String(Math.round(n));
}

function destroyChart() {
  if (chart) { chart.destroy(); chart = null; }
}

/* ═══ Indicador do mês atual (tracejado) ═══ */
function applyPartialIndicator(series) {
  // Guarda no chart para uso futuro (ex.: tooltip, plugin custom)
  if (chart) chart.$isPartial = series.isPartial;
}

/* ═══ Tabela ═══ */
function renderTable(series) {
  const el = document.getElementById("trendsTable");
  if (!el) return;

  const periods = series.periods;
  const totalData = series.total.data;
  const platforms = series.platforms;

  if (!periods.length) {
    el.innerHTML = `<div class="empty-state">Sem dados.</div>`;
    return;
  }

  // Cabeçalho: Período + Total + Variação + (uma coluna por plataforma)
  const head = `
    <thead>
      <tr>
        <th>Período</th>
        <th>Total</th>
        <th>Variação</th>
        ${platforms.map((p) => `<th>${escapeHtml(p.name)}</th>`).join("")}
      </tr>
    </thead>
  `;

  const body = periods.map((period, i) => {
    const cur = totalData[i];
    const prev = i > 0 ? totalData[i - 1] : null;
    const variation = computeVariation(cur, prev);
    const partial = series.isPartial[i] ? ' <span class="trends-partial-tag">em andamento</span>' : "";

    const variationCell = variation === null
      ? `<span class="czero">—</span>`
      : `<span class="${variation >= 0 ? "up" : "down"}">${variation >= 0 ? "↑" : "↓"} ${Math.abs(variation).toFixed(1)}%</span>`;

    return `
      <tr>
        <td>${escapeHtml(series.labels[i])}${partial}</td>
        <td>${cur !== null ? formatMetricValue(cur, series.metric) : "—"}</td>
        <td>${variationCell}</td>
        ${platforms.map((p) => {
          const v = p.data[i];
          return `<td>${v !== null ? formatMetricValue(v, series.metric) : "—"}</td>`;
        }).join("")}
      </tr>
    `;
  }).join("");

  el.innerHTML = `<table class="trends-table">${head}<tbody>${body}</tbody></table>`;
}

/* ═══ Bind ═══ */
function bindEvents() {
  document.getElementById("trendsMetric")?.addEventListener("change", (e) => {
    currentMetric = e.target.value;
    render();
  });
  document.getElementById("trendsMonths")?.addEventListener("change", (e) => {
    currentMonths = Number(e.target.value) || 6;
    render();
  });
}

/* ═══ Re-render quando o tema muda ═══ */
window.addEventListener("dashboard:theme-change", () => {
  if (chart) render();
});