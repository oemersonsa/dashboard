import { state, getAvailablePeriods, getPeriodLabel } from "../core/state.js";
import { escapeHtml as esc, escapeAttribute as attr, R as RS } from "../core/format.js";
import { appIcon } from "./app-icons.js";
import { calcTotals, getLoggedDays, getMonthDays } from "../features/sales/sales.calc.js";
import { computeGoalProgress } from "../features/goals/goals.calc.js";
import { getCachedAccountProfile, loadAccountProfile } from "../features/account/account.ui.js";

const media = matchMedia("(max-width: 860px)");
const utilityScreens = new Set(["more", "backups", "reports"]);
const titles = { hub: "Kanri", more: "Mais", backups: "Backups", reports: "Relatórios", connections: "Conexões", account: "Minha conta", setup: "Plataformas", dailyClose: "Fechamento diário",
  overview: "Visão geral", entries: "Registrar vendas", daily: "Vendas diárias", weekly: "Semanas", platforms: "Plataformas", orders: "Pedidos e margens", comparison: "Comparativo", trends: "Tendência", projection: "Metas e projeção", calculator: "Preço de venda", roas: "Calculadora de ROAS" };
const analyses = [["overview", "Visão geral", "bars"], ["entries", "Lançamentos", "clipboard"], ["daily", "Vendas diárias", "bars"], ["weekly", "Semanas", "calendar"], ["platforms", "Plataformas", "store"], ["orders", "Pedidos e margens", "orders"], ["comparison", "Comparativo", "bars"], ["trends", "Tendência", "trend"], ["projection", "Metas e projeção", "target"]];
let api, visible = false, queued = false, historySignature = "", hubSignature = "", reportSignature = "", user = "";
const el = id => document.getElementById(id);
const setText = (element, text) => { if (element && element.textContent !== text) element.textContent = text; };
const row = (title, icon, attributes, subtitle = "") => `<button class="mobile-menu-row" type="button" ${attributes}>${appIcon(icon)}<span><strong>${title}</strong>${subtitle ? `<small>${subtitle}</small>` : ""}</span><span aria-hidden="true">›</span></button>`;

export const isMobile = () => media.matches;
export const isMobileScreen = screen => utilityScreens.has(screen);

export function initMobileWorkspace(callbacks) {
  api = callbacks;
  const app = document.querySelector(".app");
  const header = document.createElement("header");
  header.id = "mobileAppHeader"; header.className = "mobile-only mobile-app-header"; header.hidden = true;
  header.innerHTML = `<div class="mobile-header-line"><button class="mobile-back" data-mobile-action="back" type="button" aria-label="Voltar">${appIcon("chevronLeft")}</button><h1 id="mobilePageTitle" tabindex="-1">Kanri</h1><button class="mobile-finish-setup" type="button" data-mobile-action="finish-setup" hidden>Concluir</button><button class="mobile-avatar" type="button" data-mobile-screen="account" aria-label="Abrir Minha conta"><span>E</span><img alt="" hidden></button></div><div class="mobile-header-context"><h2 id="mobileGreeting"></h2><label class="mobile-period">${appIcon("calendar")}<select id="mobilePeriodSelect" aria-label="Mês e ano"></select></label></div><button type="button" id="mobileSaveStatus" class="mobile-save-status" data-mobile-action="save" aria-live="polite"></button>`;
  app.prepend(header);
  const screen = document.createElement("section");
  screen.id = "mobileUtilityScreen"; screen.className = "screen mobile-utility-screen"; screen.hidden = true;
  screen.innerHTML = `<main class="mobile-utility-main"><div id="mobileMore" hidden>
    ${row("Minha conta", "user", 'data-mobile-screen="account"', "Perfil, segurança e aparência")}
    <h2 class="mobile-menu-heading">Análises</h2><details class="mobile-menu-group" open><summary>${appIcon("bars")}Todas as análises<span aria-hidden="true">⌄</span></summary>${analyses.map(([tab, title, icon]) => row(title, icon, `data-mobile-tab="${tab}"`)).join("")}${row("Relatórios", "report", 'data-mobile-screen="reports"')}</details>
    <h2 class="mobile-menu-heading">Ferramentas</h2><details class="mobile-menu-group"><summary>${appIcon("calculator")}Calculadoras e fechamento<span aria-hidden="true">⌄</span></summary>${row("Calculadora de preço", "calculator", 'data-mobile-tab="calculator"')}${row("Calculadora de ROAS", "roas", 'data-mobile-tab="roas"')}${row("Fechamento diário", "wallet", 'data-mobile-screen="dailyClose"')}</details>
    <h2 class="mobile-menu-heading">Configurações</h2><div class="mobile-menu-group">${row("Gerenciar plataformas", "settings", 'data-mobile-action="platforms"')}${row("Backups", "backup", 'data-mobile-screen="backups"')}${row("Minha conta", "user", 'data-mobile-screen="account"')}</div>
  </div><div id="mobileBackups" hidden><section class="card mobile-backup-card">${appIcon("download")}<h2>Exportar backup</h2><p>Salve uma cópia dos seus dados.</p><button class="btn btn-secondary" type="button" data-mobile-action="export-backup">Baixar backup</button></section><section class="card mobile-backup-card">${appIcon("upload")}<h2>Restaurar backup</h2><p>Selecione um arquivo de backup gerado pelo Kanri.</p><button class="btn btn-secondary" type="button" data-mobile-action="import-backup">Escolher arquivo</button></section><p class="mobile-info">${appIcon("info")}Confira a prévia e escolha mesclar ou substituir antes de restaurar.</p></div>
  <div id="mobileReports" hidden></div></main>`;
  app.append(screen);
  const nav = document.createElement("nav");
  nav.id = "mobileBottomNav"; nav.className = "mobile-only mobile-bottom-nav"; nav.hidden = true; nav.setAttribute("aria-label", "Navegação principal mobile");
  nav.innerHTML = [["hub", "Início", "home"], ["panel", "Painel", "bars"], ["register", "Registrar", "plus"], ["connections", "Conexões", "link"], ["more", "Mais", "more"]].map(([action, label, icon]) => `<button type="button" data-mobile-nav="${action}" aria-label="${action === "register" ? "Registrar vendas" : label}"><span class="mobile-nav-icon">${appIcon(icon)}</span><span>${label}</span></button>`).join("");
  app.append(nav);
  const account = document.querySelector(".account-main");
  const accountTabs = document.createElement("div"); accountTabs.className = "mobile-only mobile-account-tabs"; accountTabs.setAttribute("role", "group"); accountTabs.setAttribute("aria-label", "Configurações da conta");
  accountTabs.innerHTML = [["profile", "Perfil"], ["security", "Segurança"], ["appearance", "Aparência"]].map(([section, label]) => `<button type="button" data-mobile-account="${section}" aria-pressed="${section === "profile"}">${label}</button>`).join("");
  account.prepend(accountTabs); account.dataset.mobileSection = "profile";
  const logout = document.createElement("button"); logout.type = "button"; logout.className = "mobile-only btn mobile-logout"; logout.dataset.mobileAction = "logout"; logout.innerHTML = appIcon("logout") + "Sair da conta"; account.append(logout);
  const entries = el("dashboard-panel-entries"); entries.dataset.mobileEntry = "register";
  const entryTabs = document.createElement("div"); entryTabs.className = "mobile-only mobile-entry-tabs"; entryTabs.setAttribute("role", "group"); entryTabs.setAttribute("aria-label", "Lançamentos");
  entryTabs.innerHTML = `<button type="button" data-mobile-entry="register" aria-pressed="true">Registrar</button><button type="button" data-mobile-entry="history" aria-pressed="false">Histórico</button>`;
  entries.prepend(entryTabs);
  const history = document.createElement("div"); history.id = "mobileEntryHistory"; history.className = "mobile-only mobile-entry-history"; entries.append(history);
  const tabs = document.createElement("nav"); tabs.className = "mobile-only mobile-analysis-tabs"; tabs.setAttribute("aria-label", "Análises de vendas");
  tabs.innerHTML = [["overview", "Resumo"], ["daily", "Diárias"], ["weekly", "Semanas"], ["platforms", "Plataformas"]].map(([tab, label]) => `<button type="button" data-mobile-tab="${tab}">${label}</button>`).join("");
  el("dashboardMain").prepend(tabs);
  const pricing = el("dashboard-panel-calculator"), priceTabs = document.createElement("div");
  pricing.querySelector(".pricing-workspace").dataset.mobilePrice = "product";
  priceTabs.className = "mobile-only mobile-price-tabs"; priceTabs.setAttribute("role", "group"); priceTabs.setAttribute("aria-label", "Etapas da calculadora de preço");
  priceTabs.innerHTML = [["product", "Produto"], ["costs", "Custos"], ["result", "Resultado"]].map(([step, label]) => `<button type="button" data-mobile-price="${step}" aria-pressed="${step === "product"}">${label}</button>`).join("");
  pricing.querySelector(".pricing-workspace").before(priceTabs);
  const priceNext = document.createElement("button"); priceNext.type = "button"; priceNext.className = "mobile-only btn btn-primary mobile-price-next"; priceNext.dataset.mobilePrice = "costs"; priceNext.textContent = "Continuar para custos";
  pricing.append(priceNext);
  document.addEventListener("click", onClick);
  el("mobilePeriodSelect").addEventListener("change", async event => {
    const select = event.currentTarget; select.disabled = true;
    try { if (select.value === "new") api.openAddMonth(); else await api.switchMonth(select.value); }
    finally { select.disabled = false; refreshMobileWorkspace(); }
  });
  media.addEventListener("change", () => {
    if (!media.matches && isMobileScreen(api.getActiveScreen())) { api.setActiveScreen("hub"); api.renderScreen(); }
    refreshMobileWorkspace();
  });
  window.addEventListener("dashboard:period-changed", refreshMobileWorkspace);
  window.addEventListener("dashboard:workspace-rendered", refreshMobileWorkspace);
  window.addEventListener("dashboard:account-profile-updated", refreshMobileWorkspace);
  // Existing renderers update asynchronously. Annotate the live cells instead of
  // copying tables, so editing, buttons and accessibility keep their original DOM.
  new MutationObserver(() => {
    if (!media.matches || !visible || queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; decorateTables(); syncStatus(); renderHistory(); renderHub(); });
  }).observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-status"] });
}

function navigate(screen, tab, entry = "history") {
  if (screen === "dashboard") {
    if (tab === "entries") setEntry(entry);
    state.activeTab = tab || "overview";
  }
  if (screen === "setup") api.openSetupScreen();
  else { api.setActiveScreen(screen); api.renderScreen(); }
  refreshMobileWorkspace(); window.scrollTo({ top: 0, behavior: "instant" });
}
function setEntry(mode) {
  el("dashboard-panel-entries").dataset.mobileEntry = mode;
  document.querySelectorAll("button[data-mobile-entry]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.mobileEntry === mode)));
}
function onClick(event) {
  if (!media.matches) return;
  const target = event.target.closest("[data-mobile-nav], [data-mobile-tab], [data-mobile-screen], [data-mobile-action], [data-mobile-account], [data-mobile-entry], [data-mobile-edit-day], button[data-mobile-price]");
  if (!target) return;
  event.preventDefault();
  const { mobileNav: nav, mobileTab: tab, mobileScreen: screen, mobileAction: action, mobileAccount: account, mobileEntry: entry, mobileEditDay: day } = target.dataset;
  if (nav === "register") navigate("dashboard", "entries", "register");
  else if (nav === "panel") navigate("dashboard", "overview");
  else if (nav) navigate(nav);
  else if (tab) navigate("dashboard", tab);
  else if (screen) navigate(screen);
  else if (account) {
    document.querySelector(".account-main").dataset.mobileSection = account;
    document.querySelectorAll("[data-mobile-account]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.mobileAccount === account)));
  } else if (entry) { setEntry(entry); refreshMobileWorkspace(); }
  else if (target.dataset.mobilePrice) {
    const step = target.dataset.mobilePrice;
    document.querySelector(".pricing-workspace").dataset.mobilePrice = step;
    document.querySelectorAll(".mobile-price-tabs button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.mobilePrice === step)));
    const next = document.querySelector(".mobile-price-next");
    next.dataset.mobilePrice = step === "product" ? "costs" : step === "costs" ? "result" : "costs";
    next.textContent = step === "product" ? "Continuar para custos" : step === "costs" ? "Ver resultado" : "Voltar aos custos";
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  else if (day !== undefined) {
    el("openDailyDetailsButton").click();
    requestAnimationFrame(() => { const input = el("dailyDetailsTable").querySelector(`[data-day-index="${Number(day)}"]`); input?.scrollIntoView({ block: "center" }); input?.focus({ preventScroll: true }); });
  } else if (action === "back") navigate(document.body.dataset.screen === "more" ? "hub" : "more");
  else if (action === "platforms") navigate("setup");
  else if (action === "finish-setup") el("finishSetupButton").click();
  else if (action === "save") void api.saveNow();
  else if (action === "export-backup") void api.exportBackup();
  else if (action === "import-backup") void api.openImportBackupModal();
  else if (action === "report") void api.openReport();
  else if (action === "logout") api.handleLogout();
}

export function renderMobileScreen(screen) {
  el("mobileUtilityScreen").hidden = false;
  for (const [name, id] of [["more", "mobileMore"], ["backups", "mobileBackups"], ["reports", "mobileReports"]]) el(id).hidden = screen !== name;
  if (screen === "reports") renderReports();
}

export function refreshMobileWorkspace() {
  if (!api) return;
  visible = document.body.classList.contains("workspace-active") && Boolean(state.auth?.username && state.platforms.length);
  const enabled = media.matches && visible;
  el("mobileBottomNav").hidden = !enabled; el("mobileAppHeader").hidden = !enabled;
  if (!enabled) return;
  if (user !== state.auth.username) {
    user = state.auth.username; hubSignature = historySignature = reportSignature = "";
    document.querySelector(".account-main").dataset.mobileSection = "profile";
    document.querySelectorAll("[data-mobile-account]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.mobileAccount === "profile")));
    void loadAccountProfile().then(refreshMobileWorkspace);
  }
  const screen = document.body.dataset.screen, tab = state.activeTab;
  const profile = getCachedAccountProfile(user), name = profile.displayName || user;
  const title = screen === "dashboard" ? tab === "entries" && el("dashboard-panel-entries").dataset.mobileEntry === "history" ? "Lançamentos" : titles[tab] : titles[screen];
  setText(el("mobilePageTitle"), title || "Kanri");
  document.querySelector(".mobile-finish-setup").hidden = screen !== "setup";
  document.querySelector(".mobile-back").hidden = ["hub", "more", "connections"].includes(screen);
  const avatar = document.querySelector(".mobile-avatar"); setText(avatar.querySelector("span"), Array.from(name)[0]?.toUpperCase() || "U");
  const image = avatar.querySelector("img"); image.hidden = !profile.avatarData;
  if (profile.avatarData && image.getAttribute("src") !== profile.avatarData) image.src = profile.avatarData;
  if (!profile.avatarData) image.removeAttribute("src");
  avatar.querySelector("span").hidden = Boolean(profile.avatarData);
  const hasPeriod = screen === "hub" || screen === "reports" || screen === "dashboard" && !["calculator", "roas", "orders", "comparison"].includes(tab) && !(tab === "entries" && el("dashboard-panel-entries").dataset.mobileEntry === "register");
  document.querySelector(".mobile-header-context").hidden = !hasPeriod;
  el("mobileGreeting").hidden = screen !== "hub"; setText(el("mobileGreeting"), `Olá, ${name.split(" ")[0]}`);
  const select = el("mobilePeriodSelect"), options = getAvailablePeriods().map(key => `<option value="${attr(key)}">${esc(getPeriodLabel(key))}</option>`).join("") + '<option value="new">＋ Criar outro mês</option>';
  if (select.innerHTML !== options) select.innerHTML = options;
  select.value = state.currentMonth;
  const selected = screen === "hub" ? "hub" : screen === "connections" ? "connections" : screen === "dashboard" && tab === "entries" && el("dashboard-panel-entries").dataset.mobileEntry === "register" ? "register" : screen === "dashboard" && !["calculator", "roas"].includes(tab) || screen === "reports" ? "panel" : "more";
  document.querySelectorAll("[data-mobile-nav]").forEach(button => {
    const active = button.dataset.mobileNav === selected;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  });
  document.querySelector(".mobile-analysis-tabs").hidden = screen !== "dashboard" || !["overview", "daily", "weekly", "platforms"].includes(tab);
  document.querySelectorAll(".mobile-analysis-tabs button").forEach(button => {
    button.classList.toggle("active", button.dataset.mobileTab === tab);
    if (button.dataset.mobileTab === tab) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  });
  syncStatus(); decorateTables(); renderHub(); renderHistory();
  if (screen === "reports") renderReports();
}

function syncStatus() {
  const original = document.querySelector(".screen:not([hidden]) .save-indicator");
  const status = original?.dataset.status || "idle";
  const statusNode = el("mobileSaveStatus");
  if (statusNode.dataset.status !== status) statusNode.dataset.status = status;
  setText(statusNode, status === "saving" ? "Salvando…" : status === "error" ? "Erro ao salvar · tentar novamente" : "Dados salvos");
  statusNode.hidden = !["saving", "error"].includes(status);
}
function renderHub() {
  if (api.getActiveScreen() !== "hub") return;
  const shell = document.querySelector(".hub-shell"); if (!shell.firstElementChild) return;
  let root = el("mobileHubSummary");
  if (!root) { root = document.createElement("div"); root.id = "mobileHubSummary"; root.className = "mobile-only mobile-hub-content"; shell.querySelector("header").after(root); hubSignature = ""; }
  const total = calcTotals(state.currentMonth), goal = computeGoalProgress(state.currentMonth, state.goals?.[state.currentMonth]?.target || 0, state);
  const days = getLoggedDays(state.currentMonth), monthDays = getMonthDays(state.currentMonth);
  const signature = JSON.stringify([state.currentMonth, total.net, total.orders, goal, days]);
  if (signature === hubSignature) return; hubSignature = signature;
  root.innerHTML = `<h2 class="mobile-section-title">Seu mês em resumo</h2><section class="card mobile-hub-summary"><span>Vendas após devoluções</span><strong class="mobile-hero-value">${RS(total.net)}</strong><div class="mobile-hub-stats"><div><strong>${Number(total.orders).toLocaleString("pt-BR")}</strong><span>Pedidos</span></div><div><strong>${days} de ${monthDays}</strong><span>Dias lançados</span></div></div></section><section class="card mobile-goal-card"><div><span>Meta mensal</span><b>${goal.hasGoal ? Math.round(goal.percent) + "%" : "—"}</b></div><strong>${goal.hasGoal ? RS(goal.target) : "Defina sua meta"}</strong><div class="mobile-goal-track"><span style="width:${goal.hasGoal ? Math.max(0, Math.min(100, goal.percent)) : 0}%"></span></div><small>${goal.hasGoal ? `Faltam ${RS(goal.remaining)}` : "Defina uma meta para acompanhar o progresso."}</small><button class="mobile-stretched-link" type="button" data-mobile-tab="projection" aria-label="Abrir metas e projeção"></button></section><h2 class="mobile-section-title">Ações rápidas</h2><div class="mobile-hub-actions">${row("Importar planilha", "upload", "data-open-sales-import", "Importe suas vendas diárias de uma planilha.")}${row("Ver relatório do mês", "report", 'data-mobile-screen="reports"', "Acompanhe suas vendas e resultados.")}</div>`;
}
function renderHistory() {
  if (api.getActiveScreen() !== "dashboard" || state.activeTab !== "entries") return;
  const days = state.db[state.currentMonth]?.days || [], signature = JSON.stringify([state.currentMonth, days, state.platforms]);
  if (signature === historySignature) return; historySignature = signature;
  const sorted = days.map((day, index) => ({ day, index })).sort((a, b) => b.day.d.localeCompare(a.day.d));
  el("mobileEntryHistory").innerHTML = `<section class="card mobile-history-total"><span>Total do mês · vendas brutas</span><strong>${RS(calcTotals(state.currentMonth).gross)}</strong></section>${sorted.map(({ day, index }) => {
    const platforms = state.platforms.filter(platform => Number(day[platform.key]) || Number(day[`orders_${platform.key}`]) || Number(day[`refunds_${platform.key}`]));
    const total = state.platforms.reduce((sum, platform) => sum + Number(day[platform.key] || 0), 0);
    return `<details class="mobile-day-card" open><summary><span>${esc(day.d)}</span><strong>${RS(total)}</strong><span aria-hidden="true">⌄</span></summary><div>${platforms.map(platform => `<div class="mobile-day-platform"><span>${esc(platform.name)}</span><strong>${RS(Number(day[platform.key] || 0))}</strong><small>${Number(day[`orders_${platform.key}`] || 0)} pedidos${Number(day[`refunds_${platform.key}`]) ? ` · ${RS(Number(day[`refunds_${platform.key}`]))} em devoluções` : ""}</small></div>`).join("")}<button class="btn btn-secondary" type="button" data-mobile-edit-day="${index}">${appIcon("edit")}Editar dia</button></div></details>`;
  }).join("") || '<p class="card-sub">Nenhum lançamento neste mês.</p>'}`;
}
function renderReports() {
  const totals = calcTotals(state.currentMonth), signature = JSON.stringify([state.currentMonth, totals]);
  if (signature === reportSignature) return; reportSignature = signature;
  el("mobileReports").innerHTML = `<p class="card-sub">Prepare o resumo do seu negócio.</p><section class="card mobile-report-preview">${appIcon("report")}<h2>${esc(getPeriodLabel(state.currentMonth))}</h2><p>Relatório mensal</p><dl><dt>Vendas brutas</dt><dd>${RS(totals.gross)}</dd><dt>Devoluções</dt><dd>${RS(totals.totalRet)}</dd><dt>Após devoluções</dt><dd>${RS(totals.net)}</dd><dt>Pedidos</dt><dd>${Number(totals.orders).toLocaleString("pt-BR")}</dd></dl><button class="btn btn-primary" type="button" data-mobile-action="report">Gerar relatório</button><small>Consulte o detalhamento e exporte em PNG, CSV ou Excel.</small></section>`;
}

function decorateTables() {
  const tables = document.querySelectorAll("#overviewRecentTable, #dailyInlineTable, #dailyDetailsTable, #platformPerformanceTable, .comparison-table, #trendsTable table, #orderMarginRows, #orderMarginCharges, #mlRows, #mlDashboardDays, #reportContent table, #salesSheetImportModal table");
  tables.forEach(element => {
    const table = element.tagName === "TABLE" ? element : element.closest("table"); if (!table) return;
    table.classList.add("mobile-card-table");
    const grid = [];
    [...(table.tHead?.rows || [])].forEach((row, ri) => {
      grid[ri] ||= []; let column = 0;
      [...row.cells].forEach(cell => {
        while (grid[ri][column]) column++;
        for (let r = ri; r < ri + cell.rowSpan; r++) { grid[r] ||= []; for (let c = column; c < column + cell.colSpan; c++) grid[r][c] = cell.textContent.trim(); }
        column += cell.colSpan;
      });
    });
    [...table.tBodies, ...(table.tFoot ? [table.tFoot] : [])].forEach(section => [...section.rows].forEach(row => {
      let column = 0;
      [...row.cells].forEach(cell => {
        const label = [...new Set(grid.map(row => row[column]).filter(Boolean))].join(" · ");
        if (cell.dataset.mobileLabel !== label) cell.dataset.mobileLabel = label;
        column += cell.colSpan;
      });
    }));
  });
}
