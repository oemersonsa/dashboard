import { state, getPeriodLabel } from "../../core/state.js";
import { RS } from "../../core/format.js";
import { platformBadge } from "../../ui/icons.js";
import { getPlatformVisualColor } from "../../ui/charts.js";
import { calcTotals, getComparisonPeriod, getLoggedDays, getMonthDays } from "../sales/sales.calc.js";

export function init() {
  render();
}

function calcProjection(month) {
  const t = calcTotals(month);
  if (!t) return null;
  const ld = getLoggedDays(month);
  const md = getMonthDays(month);
  const sda = ld > 0 ? t.gross / ld : 0;
  const oda = ld > 0 ? t.orders / ld : 0;
  const rda = ld > 0 ? t.totalRet / ld : 0;

  return {
    loggedDays: ld, monthDays: md,
    salesDailyAverage: sda, ordersDailyAverage: oda, returnsDailyAverage: rda,
    projectedGross: sda * md, projectedOrders: oda * md, projectedReturns: rda * md,
    projectedNet: (sda * md) - (rda * md),
    platforms: state.platforms.map((p) => {
      const rg = Number(t.sales[p.key] || 0);
      const da = ld > 0 ? rg / ld : 0;
      return { key: p.key, realizedGross: rg, dailyAverage: da, projectedGross: da * md };
    }),
    currentReturnRate: t.gross > 0 ? (t.totalRet / t.gross) * 100 : 0,
    projectedReturnRate: (sda * md) > 0 ? ((rda * md) / (sda * md)) * 100 : 0
  };
}

function render() {
  const t = calcTotals(state.currentMonth);
  const p = calcProjection(state.currentMonth);
  const el = document.getElementById("projectionGrid");
  if (!el || !p) return;

  const c = getComparisonPeriod(state.currentMonth);
  const pt = c.previousTotals;
  const cl = pt ? `${getPeriodLabel(c.previousName)}${c.cutoffDay ? ` até dia ${c.cutoffDay}` : ""}` : "";

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
    <div class="projection-card"><div class="projection-label">Dias Lançados</div><div class="projection-value">${p.loggedDays}/${p.monthDays}</div><div class="projection-sub">Base usada para a média do mês</div></div>
    <div class="projection-card"><div class="projection-label">Projeção de Pedidos</div><div class="projection-value">${Math.round(p.projectedOrders)}</div><div class="projection-sub">Média diária: ${p.ordersDailyAverage.toFixed(1)} pedidos</div><div class="projection-meta">Realizado até agora: ${t.orders} pedidos</div></div>
    <div class="projection-card"><div class="projection-label">Projeção de Vendas</div><div class="projection-value">${RS(p.projectedGross)}</div><div class="projection-sub">Média diária: ${RS(p.salesDailyAverage)}</div><div class="projection-meta">${pt ? `vs bruto de ${cl}: ${varH(p.projectedGross, pt.gross)}` : "Sem mês anterior para comparar"}</div></div>
    <div class="projection-card"><div class="projection-label">Projeção de Devoluções</div><div class="projection-value neg">${RS(p.projectedReturns)}</div><div class="projection-sub">Média diária: ${RS(p.returnsDailyAverage)}</div><div class="projection-meta">Taxa projetada: ${p.projectedReturnRate.toFixed(1)}%</div></div>
    <div class="projection-card"><div class="projection-label">Projeção Líquida</div><div class="projection-value" style="color:var(--accent)">${RS(p.projectedNet)}</div><div class="projection-sub">Taxa atual: ${p.currentReturnRate.toFixed(1)}%</div><div class="projection-meta">Realizado até agora: ${RS(t.net)}</div></div>
    <div class="projection-card projection-platform-card">
      <div class="projection-platform-head"><div><div class="projection-label">Projeção por Plataforma</div><div class="projection-sub">Estimativa pela mesma média diária</div></div><div class="projection-platform-total">${RS(ppt)}</div></div>
      <div class="projection-platform-list">${platformHtml}</div>
    </div>
  `;
}

function varH(current, previous) {
  if (!previous || previous === 0) return "-";
  const diff = ((current - previous) / previous) * 100;
  return `<span class="${diff >= 0 ? "up" : "down"}">${diff >= 0 ? "↑" : "↓"} ${Math.abs(diff).toFixed(1)}%</span>`;
}