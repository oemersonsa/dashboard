import { state, getPeriodLabel, saveNavigation } from "../../core/state.js";
import { RS, escapeHtml, escapeAttribute } from "../../core/format.js";
import { setActiveScreen, renderScreen } from "../../main.js";
import { calcTotals, getLoggedDays, getMonthDays } from "../sales/sales.calc.js";
import { computeGoalProgress } from "../goals/goals.calc.js";
import { appIcon } from "../../ui/app-icons.js";
import { getCachedAccountProfile, loadAccountProfile } from "../account/account.ui.js";
import { initSaveIndicator } from "../../ui/save-indicator.js";

let bound = false;
export function init() {
  const shell = document.querySelector("#hubScreen .hub-shell");
  const t = calcTotals(state.currentMonth);
  const goal = computeGoalProgress(state.currentMonth, state.goals?.[state.currentMonth]?.target || 0, state);
  const name = getCachedAccountProfile(state.auth.username).displayName || state.auth.username;
  const card = (icon, title, text, attribute, color = "cyan") => `<button class="hub-task-card ${color}" ${attribute} type="button"><span class="hub-task-icon">${appIcon(icon)}</span><span><strong>${title}</strong><small>${text}</small></span><span class="task-arrow" aria-hidden="true">›</span></button>`;
  shell.innerHTML = `
    <header class="topbar hub-topbar">
      <div class="header-left"><button class="icon-btn menu-toggle" id="hubMenuButton" data-workspace-menu type="button" aria-label="Abrir menu" aria-controls="dashboardSidebar" aria-expanded="false">☰</button><div class="workspace-heading"><h1>Olá, ${escapeHtml(name.split(" ")[0])}</h1><p>Aqui está um resumo do seu mês. Continue registrando suas vendas e acompanhando seus resultados.</p></div></div>
      <div class="header-right"><span class="hub-period">${appIcon("calendar")}${escapeHtml(getPeriodLabel(state.currentMonth))}</span><button class="btn btn-primary" data-dashboard-tab-target="entries" type="button">${appIcon("plus")}Registrar vendas</button><button class="icon-btn" id="hubLogoutButton" type="button" aria-label="Sair da conta" title="Sair da conta">${appIcon("logout")}</button></div>
    </header>
    <section class="card hub-month-summary"><h2 class="card-title">Seu mês em resumo ${appIcon("info")}</h2><div class="hub-month-grid">
      <div class="hub-month-metric">${appIcon("wallet")}<div><span>Vendas após devoluções</span><strong>${RS(t.net)}</strong><small>${getLoggedDays(state.currentMonth)} de ${getMonthDays(state.currentMonth)} dias lançados</small></div></div>
      <div class="hub-month-metric">${appIcon("orders")}<div><span>Pedidos</span><strong>${Number(t.orders).toLocaleString("pt-BR")}</strong><small>Registrados no mês</small></div></div>
      <div class="hub-month-goal"><div><span>Meta mensal de vendas</span><strong>${goal.hasGoal ? RS(goal.target) : "Defina sua meta"}</strong></div><b>${goal.hasGoal ? `${Math.round(goal.percent)}%` : "—"}</b><div class="hub-meter"><span style="width:${goal.hasGoal ? Math.min(100, Math.max(0, goal.percent)) : 0}%"></span></div><small>${goal.hasGoal ? `${RS(goal.remaining)} para atingir a meta` : "Acompanhe seu progresso mês a mês"}</small></div>
    </div></section>
    <div class="hub-tasks">
      ${card("plus", "Registrar vendas", "Lance as vendas do dia por plataforma de forma rápida.", 'data-dashboard-tab-target="entries"')}
      ${card("upload", "Importar planilha", "Importe suas vendas diárias de uma planilha.", "data-open-sales-import", "teal")}
      ${card("report", "Fechamento diário", "Some os valores e gere o resumo do dia.", 'data-nav="dailyClose"', "amber")}
    </div>
    <div class="hub-section-title"><h2>Continue de onde parou</h2><button class="link-btn" data-dashboard-tab-target="${escapeAttribute(state.activeTab || "overview")}" type="button">Continuar na última área →</button></div>
    <div class="hub-grid">
      ${card("bars", "Analisar desempenho", "Veja indicadores, plataformas e tendências.", 'data-nav="dashboard"', "blue")}
      ${card("target", "Metas e projeção", "Planeje o mês e acompanhe sua meta.", 'data-dashboard-tab-target="projection"', "green")}
      ${card("calculator", "Calculadoras", "Simule preços, margem e anúncios.", 'data-nav="calculator"', "orange")}
      ${card("backup", "Relatórios e backups", "Exporte seus dados e mantenha uma cópia.", 'data-nav="import"', "blue")}
    </div><div class="hub-footer-actions"><button class="link-btn" data-nav="setup" type="button">Gerenciar plataformas</button><button class="link-btn" id="hubImportBackupButton" type="button">Importar backup</button></div>`;
  initSaveIndicator();
  const username = state.auth.username;
  loadAccountProfile().then(profile => {
    if (state.auth.username !== username) return;
    const heading = shell.querySelector(".workspace-heading h1");
    if (heading) heading.textContent = `Olá, ${(profile.displayName || username).split(" ")[0]}`;
  });
  if (!bound) {
    document.addEventListener("click", event => {
      const button = event.target.closest("#hubScreen [data-dashboard-tab-target]");
      if (!button) return;
      state.activeTab = button.dataset.dashboardTabTarget;
      saveNavigation(); setActiveScreen("dashboard"); renderScreen();
    });
    bound = true;
  }
}
