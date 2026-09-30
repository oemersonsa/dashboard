import { state, parsePeriodKey } from "../../core/state.js";
import { ALL_MONTHS } from "../../core/constants.js";
import { R, RS, escapeHtml, escapeAttribute } from "../../core/format.js";
import { getPlatformVisualColor } from "../../ui/charts.js";

let chart = null;
let bound = false;
let metric = "sales";

const dayMs = 86400000;
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const isoDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const calendarDaysBetween = (from, to) => Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / dayMs) + 1;
const shortDate = (date) => date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

function periodDays() {
  const byDate = new Map();
  Object.entries(state.db || {}).forEach(([period, monthData]) => {
    const parsed = parsePeriodKey(period);
    const monthIndex = ALL_MONTHS.indexOf(parsed.month);
    if (monthIndex < 0) return;
    (monthData?.days || []).forEach((day) => {
      const [d, m] = String(day.d || "").split("/").map(Number);
      if (!d || !m) return;
      const date = new Date(parsed.year, m - 1, d);
      if (date.getMonth() !== m - 1 || date.getDate() !== d || date.getFullYear() !== parsed.year) return;
      const key = isoDate(date);
      const values = byDate.get(key) || { date, sales: {}, orders: {} };
      (state.platforms || []).forEach((platform) => {
        values.sales[platform.key] = (values.sales[platform.key] || 0) + Math.max(0, Number(day[platform.key]) || 0);
        values.orders[platform.key] = (values.orders[platform.key] || 0) + Math.max(0, Number(day[`orders_${platform.key}`]) || 0);
      });
      byDate.set(key, values);
    });
  });
  return [...byDate.values()].sort((a, b) => a.date - b.date);
}

function currentRange() {
  const range = document.getElementById("platformRange")?.value || "90";
  const today = startOfDay(new Date());
  if (range === "custom") {
    const fromValue = document.getElementById("platformDateFrom")?.value;
    const toValue = document.getElementById("platformDateTo")?.value;
    const from = fromValue ? startOfDay(new Date(`${fromValue}T00:00:00`)) : new Date(today.getTime() - 89 * dayMs);
    const to = toValue ? startOfDay(new Date(`${toValue}T00:00:00`)) : today;
    const end = to < from ? from : to;
    return { from, to: end, days: Math.max(1, calendarDaysBetween(from, end)) };
  }
  const days = Number(range) || 90;
  return { from: new Date(today.getTime() - (days - 1) * dayMs), to: today, days };
}

function sum(rows, field, platformKey = null) {
  return rows.reduce((total, row) => total + (platformKey ? row[field][platformKey] || 0 : Object.values(row[field]).reduce((a, b) => a + b, 0)), 0);
}

function filteredRows(rows, range, platformKey) {
  return rows.filter((row) => row.date >= range.from && row.date <= range.to && (platformKey === "all" || state.platforms.some((p) => p.key === platformKey)));
}

function render() {
  const root = document.getElementById("dashboard-panel-platforms");
  if (!root) return;
  const rangeSelect = document.getElementById("platformRange");
  const platformSelect = document.getElementById("platformFilter");
  if (!rangeSelect || !platformSelect) return;
  const previousPlatform = platformSelect.value;
  platformSelect.innerHTML = `<option value="all">Todas as plataformas</option>${(state.platforms || []).map((p) => `<option value="${escapeAttribute(p.key)}">${escapeHtml(p.name)}</option>`).join("")}`;
  if ([...platformSelect.options].some((option) => option.value === previousPlatform)) platformSelect.value = previousPlatform;
  const customDates = document.getElementById("platformCustomDates");
  if (customDates) customDates.hidden = rangeSelect.value !== "custom";

  const range = currentRange();
  const key = platformSelect.value || "all";
  const allRows = periodDays();
  const rows = filteredRows(allRows, range, key);
  const sales = sum(rows, "sales", key === "all" ? null : key);
  const orders = sum(rows, "orders", key === "all" ? null : key);
  const previousTo = new Date(range.from); previousTo.setDate(previousTo.getDate() - 1);
  const previousFrom = new Date(previousTo); previousFrom.setDate(previousFrom.getDate() - range.days + 1);
  const previousRows = allRows.filter((row) => row.date >= previousFrom && row.date <= previousTo);
  const previousSales = sum(previousRows, "sales", key === "all" ? null : key);
  const previousOrders = sum(previousRows, "orders", key === "all" ? null : key);
  const variation = (value, previous) => previous > 0 ? `${value >= previous ? "↑" : "↓"} ${Math.abs((value - previous) / previous * 100).toFixed(1).replace(".", ",")}% vs. período anterior` : "Sem período anterior para comparar";
  const positive = (value, previous) => value >= previous;
  const kpis = document.getElementById("platformAnalyticsKpis");
  if (kpis) kpis.innerHTML = [
    ["Vendas no período", RS(sales), variation(sales, previousSales), positive(sales, previousSales)],
    ["Pedidos no período", Math.round(orders).toLocaleString("pt-BR"), variation(orders, previousOrders), positive(orders, previousOrders)],
    ["Média diária de vendas", RS(sales / range.days), "Total ÷ dias do período", true],
    ["Média diária de pedidos", (orders / range.days).toLocaleString("pt-BR", { maximumFractionDigits: 1 }), "Total ÷ dias do período", true]
  ].map(([label, value, note, good]) => `<article class="platform-analytics-kpi"><span>${label}</span><strong>${value}</strong><small class="${note.includes("período anterior") ? (good ? "is-positive" : "is-negative") : ""}">${note}</small></article>`).join("");

  const label = document.getElementById("platformPeriodLabel");
  if (label) label.textContent = `${range.from.toLocaleDateString("pt-BR")} — ${range.to.toLocaleDateString("pt-BR")}`;
  const subtitle = document.getElementById("platformChartSubtitle");
  if (subtitle) subtitle.textContent = `${key === "all" ? "Todas as plataformas" : state.platforms.find((p) => p.key === key)?.name || "Plataforma"} • ${metric === "sales" ? "Vendas brutas" : "Pedidos"} por dia`;
  renderChart(rows, range, key);
  renderShare(rows, key);
  renderTable(rows, range, key);
}

function renderChart(rows, range, key) {
  const canvas = document.getElementById("platformAnalyticsChart");
  if (!canvas || !window.Chart) return;
  const labels = [];
  const values = [];
  const byDate = new Map(rows.map((row) => [isoDate(row.date), row]));
  const date = new Date(range.from);
  for (let i = 0; i < range.days; i += 1) {
    const row = byDate.get(isoDate(date));
    labels.push(shortDate(date));
    values.push(metric === "sales" ? sum(row ? [row] : [], "sales", key === "all" ? null : key) : sum(row ? [row] : [], "orders", key === "all" ? null : key));
    date.setDate(date.getDate() + 1);
  }
  if (chart) chart.destroy();
  const selectedPlatform = state.platforms.find((p) => p.key === key);
  const color = selectedPlatform ? getPlatformVisualColor(selectedPlatform) : (getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#3972e6");
  const money = metric === "sales";
  chart = new window.Chart(canvas.getContext("2d"), {
    type: "line",
    data: { labels, datasets: [{ label: money ? "Vendas" : "Pedidos", data: values, borderColor: color, backgroundColor: `${color}20`, fill: true, tension: 0.32, pointRadius: range.days > 60 ? 0 : 2, pointHoverRadius: 4, borderWidth: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => money ? ` ${RS(item.raw)}` : ` ${Math.round(item.raw).toLocaleString("pt-BR")} pedidos` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#929aaa", maxTicksLimit: 7, maxRotation: 0 } },
        y: { beginAtZero: true, grid: { color: getComputedStyle(document.body).getPropertyValue("--border").trim() || "#eceef2" }, ticks: { color: "#929aaa", callback: (value) => money ? (value >= 1000 ? `R$ ${(value / 1000).toLocaleString("pt-BR")}k` : `R$ ${value}`) : value } }
      }
    }
  });
}

function renderShare(rows, selectedKey) {
  const target = document.getElementById("platformShare");
  if (!target) return;
  const platforms = state.platforms || [];
  const values = platforms.map((p) => ({ platform: p, sales: sum(rows, "sales", p.key) })).filter((item) => item.sales > 0).sort((a, b) => b.sales - a.sales);
  const total = values.reduce((s, item) => s + item.sales, 0);
  if (!total) { target.innerHTML = `<div class="platform-analytics-empty">Sem vendas registradas neste período.</div>`; return; }
  let offset = 0;
  const stops = values.map(({ platform, sales }) => {
    const start = offset; offset += sales / total * 100;
    return `${getPlatformVisualColor(platform)} ${start}% ${offset}%`;
  }).join(", ");
  target.innerHTML = `<div class="platform-donut" style="--platform-donut:conic-gradient(${stops})"><div><small>TOTAL</small><strong>${RS(total)}</strong></div></div><div class="platform-share-legend">${values.map(({ platform, sales }) => {
    const percent = sales / total * 100;
    return `<button type="button" class="platform-share-row ${selectedKey === platform.key ? "is-selected" : ""}" data-platform-row="${escapeAttribute(platform.key)}"><span class="platform-share-name"><i style="--platform-color:${escapeAttribute(getPlatformVisualColor(platform))}"></i>${escapeHtml(platform.name)}</span><strong>${percent.toFixed(1).replace(".", ",")}%</strong></button>`;
  }).join("")}</div>`;
}

function renderTable(rows, range, selectedKey) {
  const table = document.getElementById("platformPerformanceTable");
  if (!table) return;
  const platforms = (state.platforms || []).filter((p) => selectedKey === "all" || p.key === selectedKey);
  const headers = `<thead><tr><th>Plataforma</th><th>Vendas</th><th>Pedidos</th><th>Média/dia</th><th>Ticket médio</th><th>Participação</th></tr></thead>`;
  const grandTotal = sum(rows, "sales");
  const body = platforms.map((platform) => {
    const sales = sum(rows, "sales", platform.key);
    const orders = sum(rows, "orders", platform.key);
    const share = grandTotal ? sales / grandTotal * 100 : 0;
    const color = getPlatformVisualColor(platform);
    return `<tr data-platform-row="${escapeAttribute(platform.key)}" tabindex="0" aria-label="Filtrar por ${escapeAttribute(platform.name)}"><td><span class="platform-table-name"><i style="--platform-color:${escapeAttribute(color)}"></i>${escapeHtml(platform.name)}</span></td><td>${RS(sales)}</td><td>${Math.round(orders).toLocaleString("pt-BR")}</td><td>${RS(sales / range.days)}<small> / dia</small></td><td>${orders ? RS(sales / orders) : "—"}</td><td><span class="platform-share-value">${share.toFixed(1).replace(".", ",")}%</span></td></tr>`;
  }).join("");
  table.innerHTML = `${headers}<tbody>${body || `<tr><td colspan="6" class="platform-analytics-empty">Cadastre plataformas para visualizar o desempenho.</td></tr>`}</tbody>`;
}

function exportCsv() {
  const range = currentRange();
  const key = document.getElementById("platformFilter")?.value || "all";
  const rows = filteredRows(periodDays(), range, key);
  const platforms = (state.platforms || []).filter((p) => key === "all" || p.key === key);
  const data = [["Plataforma", "Vendas", "Pedidos", "Média diária vendas", "Ticket médio"]];
  platforms.forEach((p) => {
    const sales = sum(rows, "sales", p.key); const orders = sum(rows, "orders", p.key);
    data.push([p.name, sales.toFixed(2), String(Math.round(orders)), (sales / range.days).toFixed(2), orders ? (sales / orders).toFixed(2) : ""]);
  });
  const csv = `\uFEFF${data.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = `vendas-plataformas-${isoDate(range.from)}-${isoDate(range.to)}.csv`; link.click(); URL.revokeObjectURL(url);
}

function bindEvents() {
  const root = document.getElementById("dashboard-panel-platforms");
  if (!root) return;
  root.addEventListener("change", (event) => {
    if (event.target.matches("#platformRange, #platformFilter, #platformDateFrom, #platformDateTo")) render();
  });
  root.addEventListener("click", (event) => {
    const metricButton = event.target.closest("[data-platform-metric]");
    if (metricButton) {
      metric = metricButton.dataset.platformMetric;
      root.querySelectorAll("[data-platform-metric]").forEach((button) => {
        const active = button === metricButton; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
      });
      render(); return;
    }
    const row = event.target.closest("[data-platform-row]");
    if (row) { const select = document.getElementById("platformFilter"); if (select) { select.value = row.dataset.platformRow; render(); } return; }
    if (event.target.closest("#platformExportButton")) exportCsv();
  });
  root.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("tr[data-platform-row]")) { event.preventDefault(); event.target.click(); }
  });
}

export function init() {
  render();
  if (!bound) { bindEvents(); bound = true; }
}
