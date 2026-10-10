/* ═══════════════════════════════════════════════════════════════
   features/trends/trends.calc.js
   Cálculos puros para o gráfico de tendência multi-mês.
   Sem DOM, sem fetch.
   ═══════════════════════════════════════════════════════════════ */

import { sortPeriodKeys, getPeriodLabel, parsePeriodKey } from "../../core/state.js";
import { calcTotals } from "../sales/sales.calc.js";

export const METRICS = {
  gross:  { key: "gross",  label: "Vendas" },
  net:    { key: "net",    label: "Vendas após devoluções" },
  orders: { key: "orders", label: "Pedidos" },
  ticket: { key: "ticket", label: "Ticket médio" }
};

/**
 * Retorna os últimos N períodos existentes em state.db, em ordem cronológica.
 */
export function getRecentPeriods(stateData, months = 6) {
  const keys = sortPeriodKeys(Object.keys(stateData?.db || {}));
  return keys.slice(-months);
}

/**
 * Constrói a série de tendência.
 * Retorna:
 *   {
 *     periods: [periodKey, ...],
 *     labels: [label do eixo X, ...],
 *     isPartial: [bool, ...],       // mês atual = true
 *     platforms: [{ key, name, color, icon, data: [n|null,...] }],
 *     total: { data: [n|null,...], goal: { data: [n|null,...] } }
 *   }
 *
 * Regra de lacunas:
 *   - Um mês SEM NENHUM lançamento (0 dias com venda) → null (não desenha ponto)
 *   - Um mês COM lançamento → número (0 é válido se houve dia lançado mas valor 0)
 *   Isso evita "linha caindo a zero" em meses que simplesmente não existem.
 */
export function getTrendSeries(stateData, options = {}) {
  const metric = options.metric || "gross";
  const months = Number(options.months || 6);

  const periods = getRecentPeriods(stateData, months);
  const platforms = stateData?.platforms || [];
  const db = stateData?.db || {};
  const goals = stateData?.goals || {};

  // Só plataformas com algum dado no intervalo
  const activePlatforms = platforms.filter((p) =>
    periods.some((period) => {
      const month = db[period];
      if (!month) return false;
      return (month.days || []).some((d) => Number(d[p.key] || 0) > 0)
        || Number(month.returns?.[p.key] || 0) > 0;
    })
  );

  const currentMonthKey = stateData?.currentMonth;
  const isPartial = periods.map((p) => p === currentMonthKey);

  // ─── Calcula um valor por métrica ───
  function computeMetric(period, platformKey) {
    const totals = calcTotals(period);
    if (!totals) return null;

    const monthData = db[period];
    const hasData = (monthData?.days || []).some((d) =>
      platformKey ? Number(d[platformKey] || 0) > 0 : true
    );
    if (!hasData) return null;

    if (metric === "gross") {
      return platformKey ? Number(totals.sales[platformKey] || 0) : totals.gross;
    }
    if (metric === "net") {
      if (platformKey) {
        const v = Number(totals.sales[platformKey] || 0);
        const r = Number(totals.ret[platformKey] || 0);
        return Math.max(0, v - r);
      }
      return totals.net;
    }
    if (metric === "orders") {
      if (platformKey) {
        return Math.max(0, Math.round(Number(totals.ordersByPlatform?.[platformKey] || 0)));
      }
      return Math.max(0, Math.round(Number(totals.orders || 0)));
    }
    if (metric === "ticket") {
      if (platformKey) {
        const v = Number(totals.sales[platformKey] || 0);
        const o = Math.max(0, Math.round(Number(totals.ordersByPlatform?.[platformKey] || 0)));
        return o > 0 ? v / o : null;
      }
      return totals.orders > 0 ? totals.gross / totals.orders : null;
    }
    return null;
  }

  // ─── Série por plataforma ───
  const platformSeries = activePlatforms.map((p) => ({
    key: p.key,
    name: p.name,
    color: p.color,
    icon: p.icon,
    iconText: p.iconText,
    data: periods.map((period) => computeMetric(period, p.key))
  }));

  // ─── Série do Total ───
  const totalData = periods.map((period) => computeMetric(period, null));

  // ─── Meta mensal é líquida; só aparece na série de vendas após devoluções. ───
  const goalData = periods.map((period) => {
    if (metric !== "net") return null;
    const g = goals?.[period]?.target;
    return Number.isFinite(g) && g > 0 ? g : null;
  });
  const hasGoal = goalData.some((v) => v !== null);

  return {
    periods,
    labels: periods.map((p) => getPeriodLabel(p)),
    isPartial,
    metric,
    platforms: platformSeries,
    total: {
      data: totalData,
      goal: hasGoal ? { data: goalData } : null
    }
  };
}

/**
 * Calcula variação % entre dois valores.
 * Retorna null se não há base de comparação.
 */
export function computeVariation(current, previous) {
  if (previous === null || previous === undefined || previous === 0) return null;
  if (current === null || current === undefined) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Formata valor conforme a métrica.
 * Reexportável para a UI.
 */
export function formatMetricValue(value, metric) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (metric === "orders") return String(Math.round(n));
  if (metric === "ticket") {
    return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
