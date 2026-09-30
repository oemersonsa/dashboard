/* ═══════════════════════════════════════════════════════════════
   features/hub/hub.ui.js — Tela inicial (Hub)
   ═══════════════════════════════════════════════════════════════ */

import { state, getPeriodLabel } from "../../core/state.js";
import { RS, escapeHtml } from "../../core/format.js";
import { platformIcon } from "../../ui/icons.js";
import { setActiveScreen, renderScreen } from "../../main.js";
import { calcTotals, getMonthDays, getLoggedDays } from "../sales/sales.calc.js";
import { computeGoalProgress, GOAL_STATUS } from "../goals/goals.calc.js";
import { initTheme } from "../../ui/theme.js";
import { toast, toastSuccess, toastError } from "../../ui/toast.js";

let bound = false;

/* ═══ INIT ═══ */
export function init() {
  render();
  if (!bound) { bindEvents(); bound = true; }
}

/* ═══ RENDER ═══ */
function render() {
  const shell = document.querySelector("#hubScreen .hub-shell");
  if (!shell) return;

  const month = state.currentMonth;
  const totals = calcTotals(month) || {
    sales: {}, ret: {}, gross: 0, totalRet: 0, net: 0, orders: 0
  };
  const platforms = state.platforms || [];
  const activePlatforms = platforms.filter((p) => Number(totals.sales[p.key] || 0) > 0);
  const returnRate = totals.gross > 0 ? (totals.totalRet / totals.gross) * 100 : 0;
  const loggedDays = getLoggedDays(month);
  const monthDays = getMonthDays(month);
  const progress = monthDays > 0 ? Math.min((loggedDays / monthDays) * 100, 100) : 0;
  const username = state.auth?.username || "Usuário";

  const preview = platforms.slice(0, 5)
    .map((p) => `<span class="hub-platform-pill">${platformIcon(p)}${escapeHtml(p.name)}</span>`)
    .join("");
  const overflow = Math.max(platforms.length - 5, 0);

  // ─── Meta do mês ───
  const goalTarget = state.goals?.[month]?.target || 0;
  let goalBlock = "";

  if (goalTarget > 0) {
    const g = computeGoalProgress(month, goalTarget, state);
    const statusColor = g.status === GOAL_STATUS.RISCO ? "var(--red)"
      : g.status === GOAL_STATUS.ATENCAO ? "var(--accent-4)"
      : "var(--green)";
    const percentLabel = `${Math.round(g.percent)}%`;

    goalBlock = `
      <div class="hub-goal-line">
        <div class="hub-goal-line-info">
          <span class="hub-goal-line-label">Meta líquida do mês</span>
          <strong>${RS(goalTarget)}</strong>
        </div>
        <div class="hub-goal-line-progress">
          <div class="hub-goal-line-bar">
            <div class="hub-goal-line-fill" style="width:${Math.min(g.percent, 100).toFixed(1)}%;background:${statusColor}"></div>
          </div>
          <span class="hub-goal-line-percent" style="color:${statusColor}">${percentLabel}</span>
        </div>
      </div>
    `;
  } else {
    goalBlock = `
      <div class="hub-goal-line hub-goal-line--empty">
        <span class="hub-goal-line-label">Sem meta definida</span>
        <button type="button" class="link-btn" data-nav="dashboard" data-dashboard-tab-target="projection">Definir meta</button>
      </div>
    `;
  }

  shell.innerHTML = `
    <div class="hub-topbar">
      <div class="logo"><img class="kanri-app-icon" src="/assets/kanri-icon.png" alt="">Kanri</div>
      <div class="hub-topbar-actions">
        <button class="icon-btn theme-toggle" type="button" data-theme-toggle aria-label="Alternar tema" title="Alternar tema">
          <span data-theme-icon></span>
        </button>
        <button class="btn btn-secondary" id="hubImportBackupButton" type="button">Importar Backup</button>
        <button class="btn btn-secondary" id="hubLogoutButton" type="button">Sair</button>
      </div>
    </div>

    <div class="hub-hero">
      <div class="hub-copy">
        <span class="hub-eyebrow">${escapeHtml(getPeriodLabel(month))}</span>
        <h1>Bem-vindo, ${escapeHtml(username)}</h1>
        <p>Escolha uma área para trabalhar. Tudo fica separado por páginas, com acesso rápido ao que você usa no dia a dia.</p>
        <div class="hub-platform-strip">
          ${preview || '<span class="hub-platform-pill">Nenhuma plataforma</span>'}
          ${overflow ? `<span class="hub-platform-pill">+${overflow}</span>` : ""}
        </div>
      </div>

      <div class="hub-summary">
        <div class="hub-summary-head">
          <span>Resumo do mês</span>
          <strong>${RS(totals.net)}</strong>
        </div>
        <div class="hub-meter"><span style="width:${progress.toFixed(1)}%"></span></div>

        <div class="hub-summary-grid">
          <div><span>Bruto</span><strong>${RS(totals.gross)}</strong></div>
          <div><span>Pedidos</span><strong>${totals.orders}</strong></div>
          <div><span>Devoluções</span><strong>${returnRate.toFixed(1)}%</strong></div>
        </div>

        ${goalBlock}

        <div class="hub-summary-note">
          ${loggedDays} de ${monthDays} dias lançados · ${activePlatforms.length} ativa${activePlatforms.length === 1 ? "" : "s"}
        </div>
      </div>
    </div>

    <div class="hub-grid">
      <button class="hub-card hub-card-primary" data-nav="dashboard" type="button">
        <span class="hub-card-icon">01</span>
        <span class="hub-card-kicker">Vendas e relatórios</span>
        <strong>Dashboard</strong>
        <span>Indicadores, gráficos, lançamentos e comparativos mensais.</span>
      </button>

      <button class="hub-card" data-nav="calculator" type="button">
        <span class="hub-card-icon">02</span>
        <span class="hub-card-kicker">Preço ideal</span>
        <strong>Calculadora</strong>
        <span>Simule comissão, frete, margem e lucro por plataforma.</span>
      </button>

      <button class="hub-card" data-nav="setup" type="button">
        <span class="hub-card-icon">03</span>
        <span class="hub-card-kicker">Cadastro base</span>
        <strong>Plataformas</strong>
        <span>Adicione ou ajuste marketplaces, cores e siglas.</span>
      </button>

      <button class="hub-card" data-nav="import" type="button">
        <span class="hub-card-icon">04</span>
        <span class="hub-card-kicker">Dados</span>
        <strong>Backup</strong>
        <span>Importe uma cópia salva para mesclar ou substituir dados.</span>
      </button>

      <button class="hub-card" data-nav="dailyClose" type="button">
        <span class="hub-card-icon">05</span>
        <span class="hub-card-kicker">Rotina diária</span>
        <strong>Fechamento Diário</strong>
        <span>Some vendas e devoluções por plataforma e gere o TXT.</span>
      </button>
    </div>
  `;

  // Atualiza ícones do botão de tema (pode ter sido recriado)
  initTheme();
}

/* ═══ BIND ═══ */
function bindEvents() {
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#hubScreen")) return;

    // ─── Botão do topo: tema ───
    if (event.target.closest("[data-theme-toggle]")) {
      return; // já tratado globalmente pelo theme.js
    }

    // ─── Botões do topo ───
    if (event.target.closest("#hubImportBackupButton")) {
      event.preventDefault();
      window.dashboard?.openImportBackupModal?.();
      return;
    }

    if (event.target.closest("#hubLogoutButton")) {
      event.preventDefault();
      window.dashboard?.handleLogout?.();
      return;
    }

    // ─── Botão "Definir meta" na linha de meta ───
    const goalBtn = event.target.closest("[data-dashboard-tab-target]");
    if (goalBtn) {
      event.preventDefault();
      const tabName = goalBtn.dataset.dashboardTabTarget;
      window.dashboard?.setActiveScreen?.("dashboard");
      window.dashboard?.renderScreen?.();
      // Aguarda o dashboard renderizar e troca a aba
      setTimeout(() => {
        window.dashboard?.switchDashboardTab?.(tabName);
      }, 100);
      return;
    }

    // ─── Cards com data-nav ───
    const nav = event.target.closest("[data-nav]");
    if (!nav) return;
    event.preventDefault();
    const target = nav.dataset.nav;

    switch (target) {
      case "dashboard":
        window.dashboard?.setActiveScreen?.("dashboard");
        window.dashboard?.renderScreen?.();
        break;
      case "calculator":
        window.dashboard?.setActiveScreen?.("calculator");
        window.dashboard?.renderScreen?.();
        break;
      case "dailyClose":
        window.dashboard?.setActiveScreen?.("dailyClose");
        window.dashboard?.renderScreen?.();
        break;
      case "setup":
        window.dashboard?.openSetupScreen?.();
        break;
      case "import":
        window.dashboard?.openImportBackupModal?.();
        break;
    }
  });
}
