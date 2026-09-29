/* ═══════════════════════════════════════════════════════════════
   features/goals/goals.calc.js
   Cálculos puros de meta mensal. Sem DOM, sem fetch.
   ═══════════════════════════════════════════════════════════════ */

import { calcTotals, getLoggedDays, getMonthDays, getLastLoggedDay } from "../sales/sales.calc.js";
import { parsePeriodKey } from "../../core/state.js";

export const GOAL_STATUS = {
  SEM_META: "sem-meta",
  ATINGIDA: "atingida",
  NO_RITMO: "no-ritmo",
  ATENCAO: "atencao",
  RISCO: "risco"
};

export const STATUS_LABEL = {
  [GOAL_STATUS.SEM_META]: "Sem meta",
  [GOAL_STATUS.ATINGIDA]: "Meta atingida",
  [GOAL_STATUS.NO_RITMO]: "No ritmo",
  [GOAL_STATUS.ATENCAO]: "Atenção",
  [GOAL_STATUS.RISCO]: "Em risco"
};

/* ═══ Progresso da meta ═══ */
export function computeGoalProgress(month, target, stateData) {
  const t = Number(target || 0);
  const totals = calcTotals(month, {}) || { gross: 0, net: 0 };
  // Meta, realizado e projeção usam vendas líquidas (bruto menos devoluções).
  const realized = Number(totals.net || 0);

  // Sem meta
  if (!Number.isFinite(t) || t <= 0) {
    return {
      hasGoal: false,
      target: 0,
      realized,
      percent: 0,
      remaining: 0,
      status: GOAL_STATUS.SEM_META,
      projected: 0,
      dailyNeeded: 0,
      daysLeft: 0,
      daysLogged: 0,
      daysTotal: getMonthDays(month),
      lastLoggedDay: 0
    };
  }

  const daysTotal = getMonthDays(month);
  const daysLogged = getLoggedDays(month);
  const lastLoggedDay = getLastLoggedDay(month);
  const daysLeft = Math.max(0, daysTotal - lastLoggedDay);

  const percent = t > 0 ? (realized / t) * 100 : 0;
  const remaining = Math.max(0, t - realized);

  // Projeção: média diária × dias do mês (mesma lógica da projeção atual)
  const dailyAvg = daysLogged > 0 ? realized / daysLogged : 0;
  const projected = dailyAvg * daysTotal;

  // Média diária necessária para bater a meta
  const dailyNeeded = daysLeft > 0 ? remaining / daysLeft : 0;

  // Status
  let status;
  if (realized >= t) status = GOAL_STATUS.ATINGIDA;
  else if (projected >= t) status = GOAL_STATUS.NO_RITMO;
  else if (projected >= t * 0.9) status = GOAL_STATUS.ATENCAO;
  else status = GOAL_STATUS.RISCO;

  return {
    hasGoal: true,
    target: t,
    realized,
    percent,
    remaining,
    status,
    projected,
    dailyNeeded,
    daysLeft,
    daysLogged,
    daysTotal,
    lastLoggedDay
  };
}

/* ═══ Status helper para UI ═══ */
export function getStatusColorVar(status) {
  switch (status) {
    case GOAL_STATUS.ATINGIDA:
    case GOAL_STATUS.NO_RITMO:
      return "--green";
    case GOAL_STATUS.ATENCAO:
      return "--accent-4";
    case GOAL_STATUS.RISCO:
      return "--red";
    default:
      return "--muted";
  }
}

/* ═══ Validação de input (string → número) ═══ */
export function parseGoalInput(raw) {
  if (raw === null || raw === undefined) return 0;
  const s = String(raw).trim();
  if (!s) return 0;

  // Aceita "50.000", "50.000,00", "50000", "50000.50"
  const cleaned = s
    .replace(/[R$\s]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")   // remove ponto de milhar
    .replace(",", ".");                   // vírgula decimal → ponto

  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}
