import { state, getPeriodLabel, setGoal, getGoal } from "../../core/state.js";
import { R, RS, escapeHtml } from "../../core/format.js";
import { platformBadge } from "../../ui/icons.js";
import { getPlatformVisualColor } from "../../ui/charts.js";
import {
  calcTotals,
  getComparisonPeriod,
  getLoggedDays,
  getMonthDays
} from "../sales/sales.calc.js";
import {
  computeGoalProgress,
  parseGoalInput,
  STATUS_LABEL,
  getStatusColorVar
} from "../goals/goals.calc.js";
import { toast, toastSuccess } from "../../ui/toast.js";
let projectionChart;

let bound = false;

export function init() {
  renderGoalCard();
  renderProjection();
  renderProjectionChart();
  if (!bound) { bindEvents(); bound = true; }
}

function renderProjectionChart() {
  const canvas = document.getElementById("goalProjectionChart");
  if (!canvas || !window.Chart) return;
  const totals = calcTotals(state.currentMonth);
  const progress = computeGoalProgress(state.currentMonth, getGoal(state.currentMonth), state);
  const length = getMonthDays(state.currentMonth);
  const days = state.db[state.currentMonth]?.days || [];
  const last = Math.max(0, ...days.map(day => Number(day.d.split("/")[0])));
  const projected = getLoggedDays(state.currentMonth) ? totals.net / getLoggedDays(state.currentMonth) * length : 0;
  let accumulated = 0;
  const values = Array.from({ length }, (_, index) => {
    const day = days.find(item => Number(item.d.split("/")[0]) === index + 1);
    accumulated += state.platforms.reduce((sum, platform) => sum + Number(day?.[platform.key] || 0), 0);
    return index + 1 <= last ? accumulated * (totals.gross > 0 ? totals.net / totals.gross : 1) : null;
  });
  const style = getComputedStyle(document.body);
  const accent = style.getPropertyValue("--accent").trim();
  const muted = style.getPropertyValue("--muted").trim();
  const datasets = [{ label: "Vendas após devoluções", data: values, borderColor: accent, backgroundColor: accent, tension: .2, pointRadius: 2, borderWidth: 2 }];
  if (progress.hasGoal) datasets.push({ label: "Meta do mês", data: Array.from({ length }, (_, index) => progress.target * (index + 1) / length), borderColor: muted, borderDash: [5, 5], pointRadius: 0, borderWidth: 2 });
  if (last && last < length) datasets.push({ label: "Projeção", data: Array.from({ length }, (_, index) => index + 1 < last ? null : totals.net + (projected - totals.net) * (index + 1 - last) / (length - last)), borderColor: "#f6c847", borderDash: [3, 5], pointRadius: 0, borderWidth: 2 });
  const config = { type: "line", data: { labels: Array.from({ length }, (_, index) => String(index + 1)), datasets }, options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: "top", labels: { color: muted, usePointStyle: true, boxWidth: 7, padding: 18 } }, tooltip: { callbacks: { label: item => `${item.dataset.label}: ${R(item.raw)}` } } }, scales: { x: { grid: { display: false }, ticks: { color: muted, maxTicksLimit: 12 } }, y: { beginAtZero: true, grid: { color: style.getPropertyValue("--border").trim() }, ticks: { color: muted, callback: value => value >= 1000 ? `R$ ${Math.round(value / 1000)} mil` : R(value) } } } } };
  if (projectionChart) { projectionChart.data = config.data; projectionChart.options = config.options; projectionChart.update("none"); }
  else projectionChart = new window.Chart(canvas, config);
}

/* ═══ Card de Meta ═══ */
function renderGoalCard() {
  const input = document.getElementById("goalInput");
  if (input) {
    const t = getGoal(state.currentMonth);
    input.value = t > 0 ? t.toFixed(2).replace(".", ",") : "";
  }

  const area = document.getElementById("goalProgressArea");
  if (!area) return;

  const target = getGoal(state.currentMonth);
  const p = computeGoalProgress(state.currentMonth, target, state);

  if (!p.hasGoal) {
    area.innerHTML = `
      <div class="empty-state">
        Sem meta definida para ${escapeHtml(getPeriodLabel(state.currentMonth))}. Digite um valor acima e pressione Enter para acompanhar o progresso.
      </div>
    `;
    return;
  }

  const colorVar = `var(${getStatusColorVar(p.status)})`;
  const statusLabel = STATUS_LABEL[p.status];

  area.innerHTML = `
    <div class="goal-progress">
      <div class="goal-progress-head">
        <div>
          <div class="goal-progress-realized">${R(p.realized)}</div>
          <div class="goal-progress-label">Após devoluções · meta de ${R(p.target)}</div>
        </div>
        <div class="goal-badge" style="background:${colorVar}1A;color:${colorVar};border-color:${colorVar}44">
          ${escapeHtml(statusLabel)}
        </div>
      </div>

      <div class="goal-progress-bar">
        <div class="goal-progress-fill" style="width:${Math.min(p.percent, 100).toFixed(1)}%;background:${colorVar}"></div>
      </div>

      <div class="goal-progress-stats">
        <div><span>% atingido</span><strong>${p.percent.toFixed(1)}%</strong></div>
        <div><span>Projeção</span><strong>${R(p.projected)}</strong></div>
        <div><span>Falta</span><strong>${R(p.remaining)}</strong></div>
        <div><span>Dias restantes</span><strong>${p.daysLeft}</strong></div>
        <div><span>Média diária necessária</span><strong>${p.daysLeft > 0 ? R(p.dailyNeeded) : "—"}</strong></div>
      </div>
    </div>
  `;
}

/* ═══ Projeção (existente) ═══ */
function renderProjection() {
  const t = calcTotals(state.currentMonth);
  const el = document.getElementById("projectionGrid");
  if (!el || !t) return;

  const c = getComparisonPeriod(state.currentMonth);
  const pt = c.previousTotals;
  const cl = pt ? `${getPeriodLabel(c.previousName)}${c.cutoffDay ? ` até dia ${c.cutoffDay}` : ""}` : "";

  const ld = getLoggedDays(state.currentMonth);
  const md = getMonthDays(state.currentMonth);
  const sda = ld > 0 ? t.gross / ld : 0;
  const oda = ld > 0 ? t.orders / ld : 0;
  const rda = ld > 0 ? t.totalRet / ld : 0;

  const p = {
    loggedDays: ld, monthDays: md,
    salesDailyAverage: sda, ordersDailyAverage: oda, returnsDailyAverage: rda,
    projectedGross: sda * md, projectedOrders: oda * md, projectedReturns: rda * md,
    projectedNet: (sda * md) - (rda * md),
    platforms: state.platforms.map((pl) => {
      const rg = Number(t.sales[pl.key] || 0);
      const da = ld > 0 ? rg / ld : 0;
      return { key: pl.key, realizedGross: rg, dailyAverage: da, projectedGross: da * md };
    }),
    currentReturnRate: t.gross > 0 ? (t.totalRet / t.gross) * 100 : 0,
    projectedReturnRate: (sda * md) > 0 ? ((rda * md) / (sda * md)) * 100 : 0
  };

  const pp = p.platforms
    .filter((i) => i.realizedGross > 0 || i.projectedGross > 0)
    .sort((a, b) => b.projectedGross - a.projectedGross);

  const mp = pp.reduce((m, i) => Math.max(m, i.projectedGross), 0);
  const ppt = pp.reduce((s, i) => s + i.projectedGross, 0);

  const platformHtml = pp.length ? pp.map((i) => {
    const p2 = state.platforms.find((x) => x.key === i.key);
    if (!p2) return "";
    const pot = ppt > 0 ? (i.projectedGross / ppt) * 100 : 0;
    const bw = mp > 0 ? Math.max(4, (i.projectedGross / mp) * 100) : 0;
    return `<div class="projection-platform-row">
      <div class="projection-platform-main">${platformBadge(p2)}<div class="projection-platform-track"><div class="projection-platform-fill" style="width:${bw.toFixed(1)}%;background:${getPlatformVisualColor(p2)}"></div></div></div>
      <div class="projection-platform-stats">
        <div><span>Projeção</span><strong>${RS(i.projectedGross)}</strong></div>
        <div><span>Média diária</span><strong>${RS(i.dailyAverage)}</strong></div>
        <div><span>Realizado</span><strong>${RS(i.realizedGross)}</strong></div>
        <div><span>Participação</span><strong>${pot.toFixed(1)}%</strong></div>
      </div>
    </div>`;
  }).join("") : `<div class="projection-platform-empty">Cadastre vendas por plataforma para ver a projeção detalhada.</div>`;

  el.innerHTML = `
    <div class="projection-summary-value">${R(p.projectedNet)}</div>
    <div class="projection-sub">Vendas estimadas após devoluções</div>
    <div class="projection-summary-stats">
      <div><span>Média diária após devoluções</span><strong>${R(ld > 0 ? t.net / ld : 0)}</strong></div>
      <div><span>Dias lançados</span><strong>${p.loggedDays} de ${p.monthDays}</strong></div>
      <div><span>Realizado até agora</span><strong>${R(t.net)}</strong></div>
    </div>
  `;
  const details = document.getElementById("projectionDetailGrid");
  if (!details) return;
  details.innerHTML = `
    <div class="projection-card"><div class="projection-label">Projeção de Pedidos</div><div class="projection-value">${Math.round(p.projectedOrders)}</div><div class="projection-sub">Média diária: ${p.ordersDailyAverage.toFixed(1)} pedidos</div><div class="projection-meta">Realizado até agora: ${t.orders} pedidos</div></div>
    <div class="projection-card"><div class="projection-label">Projeção de Vendas</div><div class="projection-value">${RS(p.projectedGross)}</div><div class="projection-sub">Média diária: ${RS(p.salesDailyAverage)}</div><div class="projection-meta">${pt ? `vs bruto de ${cl}: ${varH(p.projectedGross, pt.gross)}` : "Sem mês anterior para comparar"}</div></div>
    <div class="projection-card"><div class="projection-label">Projeção de Devoluções</div><div class="projection-value neg">${RS(p.projectedReturns)}</div><div class="projection-sub">Média diária: ${RS(p.returnsDailyAverage)}</div><div class="projection-meta">Taxa projetada: ${p.projectedReturnRate.toFixed(1)}%</div></div>
    <div class="projection-card projection-platform-card">
      <div class="projection-platform-head"><div><div class="projection-label">Projeção por Plataforma</div><div class="projection-sub">Estimativa pela mesma média diária</div></div><div class="projection-platform-total">${RS(ppt)}</div></div>
      <div class="projection-platform-list">${platformHtml}</div>
    </div>
  `;
}

/* ═══ Bind ═══ */
function bindEvents() {
  const input = document.getElementById("goalInput");
  if (input) {
    const commit = () => {
      const raw = input.value.trim();
      const parsed = parseGoalInput(raw);

      // Se vazio ou 0 → remove
      if (!raw || parsed <= 0) {
        setGoal(state.currentMonth, 0);
        toast("Meta removida");
        renderGoalCard();
        renderProjection();
        renderProjectionChart();
        return;
      }

      setGoal(state.currentMonth, parsed);
      toastSuccess(`Meta definida: ${R(parsed)}`);
      renderGoalCard();
      renderProjection();
      renderProjectionChart();
    };

    input.addEventListener("blur", commit);
    document.getElementById("saveGoalButton")?.addEventListener("click", () => {
      if (getGoal(state.currentMonth) !== parseGoalInput(input.value)) commit();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); input.blur(); }
      if (e.key === "Escape") {
        const t = getGoal(state.currentMonth);
        input.value = t > 0 ? t.toFixed(2).replace(".", ",") : "";
        input.blur();
      }
    });
  }
}

function varH(current, previous) {
  if (!previous || previous === 0) return "-";
  const diff = ((current - previous) / previous) * 100;
  return `<span class="${diff >= 0 ? "up" : "down"}">${diff >= 0 ? "↑" : "↓"} ${Math.abs(diff).toFixed(1)}%</span>`;
}
