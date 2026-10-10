/* ═══════════════════════════════════════════════════════════════
   main.js — entrypoint do frontend
   ═══════════════════════════════════════════════════════════════ */
const DEBUG = false;
const log = (...args) => { if (DEBUG) console.log(...args); };

// ─── Core ───────────────────────────────────────────────────────────────────
import {
  state,
  saveState,
  normalizeState,
  getBusinessSnapshot,
  sortPeriodKeys,
  saveNavigation, loadNavigation, getAvailablePeriods, parsePeriodKey
} from "./core/state.js";
import { hydrateAppIcons } from "./ui/app-icons.js";
import { initWorkspace, renderWorkspace } from "./ui/workspace.js";
import { createSync } from "./core/sync.js";
import { apiRequest, loadSession, saveSession, clearSession } from "./core/api.js";
import { ALL_MONTHS, MARKETPLACE_PRICING_PRESETS } from "./core/constants.js";

// ─── UI ─────────────────────────────────────────────────────────────────────
import { toast, toastSuccess, toastError } from "./ui/toast.js";
import { bindModalDismiss, openModal, closeModal } from "./ui/modal.js";
import { setupPlatformIconFallbacks } from "./ui/icons.js";
import { initSaveIndicator, setSaveStatus, refreshSaveIndicator, setLastSavedAt } from "./ui/save-indicator.js";
import { initTheme, setMode as setThemeMode, getMode as getThemeMode, getEffectiveTheme } from "./ui/theme.js";
import { showGlobalLoader, hideGlobalLoader, renderKpiSkeleton } from "./ui/skeleton.js";

// ─── Features ───────────────────────────────────────────────────────────────
import { init as initAuth, handleLogout } from "./features/auth/auth.ui.js";
import { init as initHub } from "./features/hub/hub.ui.js";
import { init as initPlatforms } from "./features/platforms/platforms.ui.js";

import {
  init as initSales,
  renderAll,
  renderTrackingAlerts,
  renderTabs,
  openAddMonth,
  confirmAddMonth,
  refreshMonthPickerForYear,
  selectMonth,
  switchDashboardPeriod
} from "./features/sales/sales.ui.js";

import { init as initDailyClose } from "./features/daily-close/daily-close.ui.js";

import {
  init as initAccount,
  getCachedAccountProfile,
  loadAccountProfile
} from "./features/account/account.ui.js";

import { loadCharts } from "./core/libraries.js";
import { readRoute, routeHash } from "./core/navigation.js";
const routeAtBoot = location.hash;
let routeRestored = false;
let applyingRoute = false;

function writeRoute() {
  if (applyingRoute || !loadSession()) return;
  const hash = routeHash(activeScreen, state.activeTab || "overview", state.currentMonth);
  if (location.hash !== hash) history.pushState(null, "", hash);
}

async function applyRoute(hash) {
  const route = readRoute(hash);
  if (!route || !loadSession()) return;
  try {
    if (route.month && route.month !== state.currentMonth) {
      await ensurePeriod(route.month);
      state.currentMonth = route.month;
    }
    applyingRoute = true;
    state.activeTab = route.tab;
    setActiveScreen(route.screen);
    renderScreen();
    saveNavigation();
    history.replaceState(null, "", routeHash(activeScreen, state.activeTab || "overview", state.currentMonth));
  } catch (error) { toastError(error.message); }
  finally { applyingRoute = false; }
}
window.addEventListener("popstate", () => void applyRoute(location.hash));
window.addEventListener("hashchange", () => void applyRoute(location.hash));
window.addEventListener("dashboard:period-changed", writeRoute);

async function openSalesSheetImport() {
  try { const feature = await import("./features/sales/sales-import.ui.js"); feature.init(); feature.openSalesSheetImport(); }
  catch (error) { toastError(error.message); }
}
async function exportBackup() {
  try { await ensureHistory(); const feature = await import("./features/backup/backup.export.js"); feature.init(); feature.exportBackup(); }
  catch (error) { toastError(error.message); }
}
async function openReport() {
  try { await ensurePeriod(state.currentMonth); const feature = await import("./features/reports/report.builder.js"); feature.init(); feature.openReport(); }
  catch (error) { toastError(error.message); }
}

// ─── Roteador ───────────────────────────────────────────────────────────────
const KNOWN_SCREENS = ["hub", "dashboard", "calculator", "dailyClose", "account"];
let activeScreen = "hub";

export function getActiveScreen() { return activeScreen; }

export function setActiveScreen(screen) {
  if (screen === "calculator") {
    state.activeTab = "calculator";
    screen = "dashboard";
  }
  activeScreen = KNOWN_SCREENS.includes(screen) ? screen : "hub";
  state.currentScreen = activeScreen === "account" ? "dashboard" : activeScreen;
  saveNavigation();
}

export function renderScreen() {
  const screens = {
    auth: document.getElementById("authScreen"),
    serverLoadError: document.getElementById("serverLoadErrorScreen"),
    setup: document.getElementById("setupScreen"),
    hub: document.getElementById("hubScreen"),
    dashboard: document.getElementById("dashboardScreen"),
    dailyClose: document.getElementById("dailyCloseScreen"),
    account: document.getElementById("accountScreen")
  };

  const hasAuth = Boolean(state.auth?.username);
  const session = loadSession();
  const isLoggedIn = Boolean(hasAuth && session && session.username === state.auth.username);
  renderWorkspace(activeScreen, Boolean(isLoggedIn && state.platforms.length));

  Object.values(screens).forEach((s) => { if (s) s.hidden = true; });
  closeSidebarSubmenus();
  closeUserPopover();
  closeMobileSidebar();

  if (!isLoggedIn) {
    document.querySelectorAll(".moverlay.open").forEach(modal => closeModal(modal.id));
    screens.auth.hidden = false;
    initAuth();
    return;
  }

  if (!state.platforms.length) {
    screens.setup.hidden = false;
    initPlatforms();
    return;
  }

  writeRoute();
  if (!routeRestored && readRoute(routeAtBoot)) {
    routeRestored = true;
    queueMicrotask(() => void applyRoute(routeAtBoot));
  }

  if (activeScreen === "dashboard") {
    screens.dashboard.hidden = false;
    syncDashboardUserProfile();
    void loadAccountProfile().then(syncDashboardUserProfile);
    initSales();
    switchDashboardTab(state.activeTab || "overview");
    return;
  }

  if (activeScreen === "dailyClose") {
    screens.dailyClose.hidden = false;
    initDailyClose();
    return;
  }

  if (activeScreen === "account") {
    screens.account.hidden = false;
    initAccount();
    return;
  }

  screens.hub.hidden = false;
  initHub();
  refreshSaveIndicator();
}

function syncDashboardUserProfile() {
  const username = String(state.auth?.username || "Usuário").trim() || "Usuário";
  const profile = document.getElementById("dashboardUserMenuButton");
  const name = document.getElementById("dashboardUserName");
  const avatar = document.getElementById("dashboardUserAvatar");
  const initial = document.getElementById("dashboardUserInitial");
  const photo = document.getElementById("dashboardUserPhoto");
  const popoverName = document.getElementById("dashboardUserPopoverName");
  if (!profile || !name || !avatar || !initial || !photo || !popoverName) return;
  const accountProfile = getCachedAccountProfile(username);
  const displayName = accountProfile.displayName.trim() || username;
  name.textContent = displayName;
  popoverName.textContent = displayName;
  initial.textContent = Array.from(displayName)[0]?.toLocaleUpperCase("pt-BR") || "U";
  photo.hidden = !accountProfile.avatarData;
  if (accountProfile.avatarData) photo.src = accountProfile.avatarData;
  else photo.removeAttribute("src");
  initial.hidden = Boolean(accountProfile.avatarData);
  profile.setAttribute("aria-label", `Conta de ${displayName}`);
  profile.hidden = false;
}

window.addEventListener("dashboard:account-profile-updated", syncDashboardUserProfile);

const tabScope = sessionStorage.getItem("dashboard-tab-id") || crypto.randomUUID();
sessionStorage.setItem("dashboard-tab-id", tabScope);
const sync = createSync({
  incremental: true,
  scope: tabScope,
  storage: localStorage,
  user: () => loadSession()?.username || "",
  snapshot: getBusinessSnapshot,
  request: body => apiRequest("/api/state", { method: body.changes ? "PATCH" : "POST", body: JSON.stringify(body), signal: AbortSignal.timeout(60000) }),
  status: (status, message) => {
    if (status === "saved") localStorage.setItem("dashboard-vendas-last-saved-v1", new Date().toISOString());
    setSaveStatus(status, message);
  },
  onConflict: () => openModal("syncConflictModal"),
  onExpired: () => {
    toastError("Sua sessão expirou. Entre novamente; suas alterações ficaram guardadas neste dispositivo.");
    clearSession(); setActiveScreen("auth"); renderScreen();
  }
});
window.addEventListener("dashboard:save-request", () => sync.schedule());
window.addEventListener("online", () => void sync.flush());
window.addEventListener("beforeunload", event => {
  if (sync.pending()) { event.preventDefault(); event.returnValue = ""; }
});
document.getElementById("syncLoadRemoteButton")?.addEventListener("click", async () => {
  if (!await loadBusinessStateFromServer({ discardPending: true })) return;
  closeModal("syncConflictModal");
  renderScreen();
});
document.getElementById("syncExportPendingButton")?.addEventListener("click", () => {
  const pending = sync.pending();
  if (!pending) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 3, state: pending.state })], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = "alteracoes-pendentes.json"; link.click();
  URL.revokeObjectURL(url);
});
window.addEventListener("dashboard:reload", () => renderScreen());

async function retryServerStateLoad(button) {
  if (!button || button.disabled) return;
  button.disabled = true;
  const originalLabel = button.textContent;
  button.textContent = "Conectando…";
  showGlobalLoader();
  const loaded = await loadBusinessStateFromServer({ quiet: true });
  hideGlobalLoader();
  button.disabled = false;
  button.textContent = originalLabel;
  if (loaded) {
    setActiveScreen(state.currentScreen || "hub");
    renderScreen();
  } else if (!loadSession()) {
    renderScreen();
  } else {
    toastError("O servidor ainda não respondeu. Tente novamente em alguns instantes.");
  }
}

/* ═══ LOAD FROM SERVER ═══ */
async function loadBusinessStateFromServer({ migrateLocal = false, quiet = false, discardPending = false } = {}) {
  if (!loadSession()) return false;
  try {
    const navigation = loadNavigation();
    const month = navigation.currentMonth || "";
    // Rascunhos antigos podem conter meses fora do carregamento inicial.
    const query = sync.hasDraft() ? "" : `?initial=1${month ? `&month=${encodeURIComponent(month)}` : ""}`;
    const result = await apiRequest(`/api/state${query}`);
    if (discardPending) sync.discard();
    const remote = sync.initialize(result?.state || {});
    const normalized = normalizeState(
      {
        ...remote,
        auth: state.auth,
        currentMonth: remote.currentMonth || state.currentMonth,
        currentScreen: remote.currentScreen || state.currentScreen || "hub",
        activeTab: remote.activeTab || state.activeTab || "overview",
        pricing: remote.pricing || state.pricing
      },
      MARKETPLACE_PRICING_PRESETS
    );
    state.goals = normalized.goals || {}; 
    state.platforms = normalized.platforms;
    state.db = normalized.db;
    state.periods = result.state.periods || Object.keys(normalized.db);
    loadedPeriods = new Set([...(result.state.loadedPeriods || []), ...Object.keys(normalized.db)]);
    state.currentMonth = normalized.currentMonth;
    state.pricing = normalized.pricing;
    state.currentScreen = normalized.currentScreen;
    state.activeTab = normalized.activeTab || state.activeTab || "overview";
    if (navigation.currentMonth && state.db[navigation.currentMonth]) state.currentMonth = navigation.currentMonth;
    if (navigation.activeTab) state.activeTab = navigation.activeTab;
    if (navigation.currentScreen) state.currentScreen = navigation.currentScreen;
    setActiveScreen(state.currentScreen || "hub");
    if (!sync.pending()) setSaveStatus("idle");
    return true;
  } catch (error) {
    console.error("Falha ao carregar dados do servidor:", error);
    if (error.status === 401) { clearSession(); return false; }
    setSaveStatus("error", "Falha ao carregar dados");
    if (!quiet) toastError("Não foi possível carregar os dados do servidor");
    return false;
  }
}

let loadedPeriods = new Set();
let historyFlight = Promise.resolve();
export function ensureHistory(periods = null) {
  const owner = loadSession()?.username;
  const run = async () => {
    const wanted = periods || getAvailablePeriods();
    const missing = wanted.filter(month => !loadedPeriods.has(month));
    if (!missing.length) return;
    if (sync.pending() && !await sync.flush()) throw new Error("Há alterações pendentes. Aguarde o salvamento antes de carregar outro período.");
    const query = periods ? `periods=${encodeURIComponent(missing.join(","))}&` : "";
    let result;
    try { result = await apiRequest(`/api/state?${query}version=${encodeURIComponent(sync.version() || "")}`); }
    catch (error) {
      if (error.status === 409 && !sync.pending()) {
        await loadBusinessStateFromServer({ quiet: true });
        throw new Error("Os dados mudaram em outra sessão e foram atualizados. Abra o período novamente.");
      }
      throw error;
    }
    if (loadSession()?.username !== owner) throw new Error("A sessão mudou. Abra a área novamente.");
    if (!sync.hydrate(result.state)) throw new Error("Os dados foram editados durante o carregamento. Aguarde o salvamento e tente novamente.");
    Object.assign(state.db, result.state.db);
    state.periods = result.state.periods || Object.keys(result.state.db);
    (result.state.loadedPeriods || state.periods).forEach(month => loadedPeriods.add(month));
  };
  const flight = historyFlight.catch(() => {}).then(run);
  historyFlight = flight;
  return flight;
}

export async function ensurePeriod(month) {
  const date = parsePeriodKey(month);
  const all = getAvailablePeriods();
  const previous = all.filter(key => sortPeriodKeys([key, month])[0] === key && key !== month).at(-1);
  const index = ALL_MONTHS.indexOf(date.month);
  const wanted = [month, previous];
  for (let offset = 1; offset <= 2; offset++) {
    const earlier = new Date(date.year, index - offset, 1);
    wanted.push(`${earlier.getFullYear()}-${ALL_MONTHS[earlier.getMonth()]}`);
  }
  await ensureHistory([...new Set(wanted.filter(Boolean))]);
  state.db[month] ||= { days: [], returns: {} };
}

/* ═══ AÇÕES GLOBAIS ═══ */
export async function saveNow() {
  saveState({ localOnly: true });
  sync.schedule();
  const saved = await sync.flush();
  if (saved) toastSuccess("Dados salvos no servidor");
}

export async function openImportBackupModal() {
  try { await ensureHistory(); const feature = await import("./features/backup/backup.export.js"); feature.init(); openModal("importBackupModal"); }
  catch (error) { toastError(error.message); }
}

export function openSetupScreen() {
  const screens = {
    auth: document.getElementById("authScreen"),
    setup: document.getElementById("setupScreen"),
    hub: document.getElementById("hubScreen"),
    dashboard: document.getElementById("dashboardScreen"),
    dailyClose: document.getElementById("dailyCloseScreen"),
    account: document.getElementById("accountScreen")
  };
  Object.values(screens).forEach((s) => { if (s) s.hidden = true; });
  screens.setup.hidden = false;
  renderWorkspace("setup", Boolean(state.auth?.username && state.platforms.length));
  initPlatforms();
}

/* ═══ BINDS GLOBAIS ═══ */
function closeSidebarSubmenus(restoreFocus = false) {
  const triggers = [...document.querySelectorAll("[data-sidebar-menu-trigger]")];
  const activeTrigger = triggers.find((trigger) => trigger.getAttribute("aria-expanded") === "true");
  triggers.forEach((trigger) => {
    trigger.setAttribute("aria-expanded", "false");
    const menu = document.getElementById(trigger.getAttribute("aria-controls"));
    if (menu) {
      menu.hidden = true;
      menu.style.removeProperty("top");
      menu.style.removeProperty("left");
    }
  });
  if (restoreFocus) activeTrigger?.focus();
}

function closeMobileSidebar() {
  const sidebar = document.getElementById("dashboardSidebar");
  const overlay = document.querySelector(".sidebar-overlay");
  sidebar?.classList.remove("open");
  overlay?.classList.remove("visible");
  sidebar?.toggleAttribute("inert", window.innerWidth <= 860);
  document.querySelectorAll("#menuToggleButton, [data-workspace-menu]").forEach(button => button.setAttribute("aria-expanded", "false"));
}

function openSidebarSubmenu(trigger, menu) {
  menu.hidden = false;
  const anchor = trigger.getBoundingClientRect();
  const popup = menu.getBoundingClientRect();
  const top = Math.max(8, Math.min(anchor.top, window.innerHeight - popup.height - 8));
  let left = anchor.right + 8;
  if (left + popup.width > window.innerWidth - 8) left = anchor.left - popup.width - 8;
  left = Math.max(8, left);
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
  trigger.setAttribute("aria-expanded", "true");
  menu.querySelector(".sidebar-item")?.focus();
}

function closeUserPopover(restoreFocus = false) {
  const button = document.getElementById("dashboardUserMenuButton");
  const popover = document.getElementById("dashboardUserPopover");
  if (!button || !popover) return;
  button.setAttribute("aria-expanded", "false");
  popover.hidden = true;
  if (restoreFocus) button.focus();
}

function positionUserPopover() {
  const button = document.getElementById("dashboardUserMenuButton");
  const popover = document.getElementById("dashboardUserPopover");
  if (!button || !popover || popover.hidden) return;
  const anchor = button.getBoundingClientRect();
  const container = button.parentElement.getBoundingClientRect();
  const width = popover.offsetWidth;
  const left = Math.max(16, Math.min(anchor.right - width, window.innerWidth - width - 16));
  popover.style.left = `${left - container.left}px`;
  popover.style.right = "auto";
}

function bindSidebarActions() {
  document.querySelectorAll(".sidebar-submenu-popover").forEach((menu) => {
    document.body.appendChild(menu);
  });

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-sidebar-menu-trigger]");
    if (trigger) {
      event.preventDefault();
      const menu = document.getElementById(trigger.getAttribute("aria-controls"));
      if (!menu) return;
      const shouldOpen = menu.hidden;
      closeSidebarSubmenus();
      if (shouldOpen) openSidebarSubmenu(trigger, menu);
      return;
    }

    if (event.target.closest(".sidebar-submenu-popover")) {
      if (event.target.closest(".sidebar-item")) {
        setTimeout(() => {
          closeSidebarSubmenus();
          closeMobileSidebar();
        }, 0);
      }
    } else {
      closeSidebarSubmenus();
    }

    const userButton = event.target.closest("#dashboardUserMenuButton");
    const userPopover = document.getElementById("dashboardUserPopover");
    if (userButton && userPopover) {
      event.preventDefault();
      const shouldOpen = userPopover.hidden;
      closeUserPopover();
      userPopover.hidden = !shouldOpen;
      userButton.setAttribute("aria-expanded", String(shouldOpen));
      if (shouldOpen) {
        positionUserPopover();
        document.getElementById("openAccountSettingsButton")?.focus();
      }
      return;
    }
    if (event.target.closest("#openAccountSettingsButton")) {
      event.preventDefault();
      closeUserPopover();
      setActiveScreen("account");
      renderScreen();
      return;
    }
    if (event.target.closest("#dashboardLogoutButton")) {
      event.preventDefault();
      closeUserPopover();
      handleLogout();
      return;
    }
    if (!event.target.closest("#dashboardUserPopover")) closeUserPopover();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (document.getElementById("dashboardSidebar")?.classList.contains("open")) {
      const trigger = document.getElementById(document.getElementById("dashboardSidebar").dataset.returnFocus || "menuToggleButton");
      closeMobileSidebar();
      trigger?.focus();
    }
    const openMenu = document.querySelector("[data-sidebar-menu-trigger][aria-expanded='true']");
    if (openMenu) {
      event.preventDefault();
      closeSidebarSubmenus(true);
    }
    const userButton = document.getElementById("dashboardUserMenuButton");
    if (userButton?.getAttribute("aria-expanded") === "true") {
      event.preventDefault();
      closeUserPopover(true);
    }
  });

  document.addEventListener("focusin", (event) => {
    if (!event.target.closest("[data-sidebar-menu-trigger], .sidebar-submenu-popover")) {
      closeSidebarSubmenus();
    }
    if (!event.target.closest("#dashboardUserMenuButton, #dashboardUserPopover")) {
      closeUserPopover();
    }
  });

  window.addEventListener("resize", () => { closeSidebarSubmenus(); closeMobileSidebar(); positionUserPopover(); });
  window.addEventListener("scroll", () => closeSidebarSubmenus(), true);

  // 1. Sidebar
  document.addEventListener("click", (event) => {
    const target = event.target.closest(
      "#sidebarOpenHub, #sidebarOpenDailyClose, " +
      "#sidebarSaveButton, #sidebarImportBackupButton, #sidebarExportBackupButton"
      + ", #sidebarImportSalesSheetButton"
    );
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    switch (target.id) {
      case "sidebarOpenHub": setActiveScreen("hub"); renderScreen(); break;
      case "sidebarOpenDailyClose": setActiveScreen("dailyClose"); renderScreen(); break;
      case "sidebarSaveButton": saveNow(); break;
      case "sidebarImportBackupButton": openImportBackupModal(); break;
      case "sidebarImportSalesSheetButton": openSalesSheetImport(); break;
      case "sidebarExportBackupButton": exportBackup(); break;
    }
  });

  document.addEventListener("click", event => {
    const screen = event.target.closest("[data-screen-nav]");
    if (screen) { event.preventDefault(); setActiveScreen(screen.dataset.screenNav); renderScreen(); }
    if (event.target.closest("[data-open-sales-import]")) void openSalesSheetImport();
    if (event.target.closest("#dashboardRegisterSalesButton")) { switchDashboardTab("entries"); document.getElementById("inputDate")?.focus(); }
    if (event.target.closest("#sidebarManagePlatformsButton")) { closeMobileSidebar(); openSetupScreen(); }
    if (event.target.closest("#sidebarBackupsButton")) { closeMobileSidebar(); openImportBackupModal(); }
  });
  // 2. Tabs do dashboard
  document.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-dashboard-tab], [data-dashboard-open]");
    if (!tab) return;
    event.preventDefault();
    if (activeScreen !== "dashboard") {
      state.activeTab = tab.dataset.dashboardTab || tab.dataset.dashboardOpen;
      setActiveScreen("dashboard"); renderScreen();
    } else switchDashboardTab(tab.dataset.dashboardTab || tab.dataset.dashboardOpen);
    closeMobileSidebar();
    const title = document.getElementById("dashboardPageTitle");
    title.tabIndex = -1; title.focus();
  });

  // 4. Seletor de período (modal de mês)
  document.addEventListener("click", (event) => {
    if (event.target.closest("#periodPickerButton, #periodPickerMenuButton")) {
      event.preventDefault();
      openAddMonth();
      return;
    }

    const picker = event.target.closest("[data-picker-month]");
    if (picker) {
      event.preventDefault();
      const month = picker.dataset.pickerMonth;
      const year = Number(
        document.getElementById("periodYearInput")?.value || new Date().getFullYear()
      );
      const period = `${year}-${month}`;
      const exists = getAvailablePeriods().includes(period);
      if (exists) {
        void switchDashboardPeriod(year, month);
        closeModal("addMonthModal");
      } else {
        selectMonth(month);
      }
      return;
    }

    if (event.target.closest("#confirmAddMonthButton")) {
      event.preventDefault();
      confirmAddMonth();
      return;
    }
    if (event.target.closest("#openDeleteMonthButton")) {
      const month = state.currentMonth;
      if (!window.confirm(`Excluir ${month}? As vendas, devoluções e a meta deste período serão removidas.`)) return;
      delete state.db[month];
      delete state.goals[month];
      state.periods = (state.periods || []).filter(period => period !== month);
      loadedPeriods.delete(month);
      const remaining = sortPeriodKeys([...new Set([...(state.periods || []), ...Object.keys(state.db)])]);
      state.currentMonth = remaining.at(-1) || `${new Date().getFullYear()}-${ALL_MONTHS[new Date().getMonth()]}`;
      saveState(); saveNavigation(); closeModal("addMonthModal");
      void ensurePeriod(state.currentMonth).then(() => { renderTabs(); renderAll(); writeRoute(); }).catch(error => toastError(error.message));
      return;
    }
  });

  // 4b. Input do ano
  document.addEventListener("input", (event) => {
    if (event.target.id === "periodYearInput") {
      refreshMonthPickerForYear();
    }
  });

  // 4c. Seletores rápidos de mês e ano do dashboard
  document.addEventListener("change", (event) => {
    if (event.target.id === "dashboardPeriodSelect") {
      switchDashboardPeriod(event.target.value.slice(0, 4), event.target.value.slice(5)); return;
    }
    if (event.target.id === "dashboardMonthSelect") {
      const year = document.getElementById("dashboardYearSelect")?.value;
      if (year && event.target.value) switchDashboardPeriod(year, event.target.value);
      return;
    }
    if (event.target.id === "dashboardYearSelect") {
      const year = event.target.value;
      const month = document.getElementById("dashboardMonthSelect")?.value;
      if (!year) return;
      const sameMonthPeriod = `${year}-${month}`;
      const availablePeriods = sortPeriodKeys(getAvailablePeriods().filter((period) => period.startsWith(`${year}-`)));
      const targetPeriod = state.db[sameMonthPeriod]
        ? sameMonthPeriod
        : availablePeriods.at(-1);
      if (targetPeriod) switchDashboardPeriod(year, targetPeriod.slice(5));
    }
  });

  // 5. Hamburger mobile
  document.addEventListener("click", (event) => {
    const menuButton = event.target.closest("#menuToggleButton, [data-workspace-menu]");
    if (!menuButton) return;
    event.preventDefault();
    const sidebar = document.getElementById("dashboardSidebar");
    if (!sidebar) return;

    let overlay = document.querySelector(".sidebar-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "sidebar-overlay";
      overlay.addEventListener("click", () => {
        const trigger = document.getElementById(sidebar.dataset.returnFocus || "menuToggleButton");
        closeMobileSidebar();
        trigger?.focus();
      });
     document.querySelector(".app")?.appendChild(overlay);
    }
    sidebar.classList.toggle("open");
    overlay.classList.toggle("visible");
    sidebar.toggleAttribute("inert", !sidebar.classList.contains("open"));
    document.querySelectorAll("#menuToggleButton, [data-workspace-menu]").forEach(button => button.setAttribute("aria-expanded", String(sidebar.classList.contains("open"))));
    sidebar.dataset.returnFocus = menuButton.id;
    if (sidebar.classList.contains("open")) (sidebar.querySelector(".sidebar-item.active") || sidebar.querySelector("button"))?.focus();
  });

  // 6. Topbar da tela de fechamento diário
  document.addEventListener("click", (event) => {
    const btn = event.target.closest(
      "#dailyCloseBackToHubButton, #dailyCloseOpenDashboardButton, #dailyCloseManagePlatformsButton"
    );
    if (!btn) return;
    event.preventDefault();
    switch (btn.id) {
      case "dailyCloseBackToHubButton":
        setActiveScreen("hub"); renderScreen(); break;
      case "dailyCloseOpenDashboardButton":
        setActiveScreen("dashboard"); renderScreen(); break;
      case "dailyCloseManagePlatformsButton":
        openSetupScreen(); break;
    }
  });

  // 7. Hub (cards + ações)
  document.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-nav]");
    if (nav) {
      event.preventDefault();
      const target = nav.dataset.nav;
      if (target === "dashboard") { setActiveScreen("dashboard"); renderScreen(); }
      else if (target === "calculator") { setActiveScreen("calculator"); renderScreen(); }
      else if (target === "dailyClose") { setActiveScreen("dailyClose"); renderScreen(); }
      else if (target === "setup") { openSetupScreen(); }
      else if (target === "import") { openImportBackupModal(); }
      return;
    }
    if (event.target.closest("#hubLogoutButton")) {
      event.preventDefault(); handleLogout(); return;
    }
    if (event.target.closest("#hubImportBackupButton")) {
      event.preventDefault(); openImportBackupModal(); return;
    }
    if (event.target.closest("#hubManagePlatformsButton")) {
      event.preventDefault(); openSetupScreen(); return;
    }
  });

  // Relatório
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#reportButton")) return;
    event.preventDefault();
    openReport();
  });
}

export function switchDashboardTab(name) {
  const valid = ["overview", "daily", "weekly", "platforms", "trends", "entries", "projection", "calculator", "roas"];
  const target = valid.includes(name) ? name : "overview";

  state.activeTab = target;
  saveNavigation();
  writeRoute();

  document.querySelectorAll(".sidebar-item[data-dashboard-tab]").forEach((b) => {
    const active = b.dataset.dashboardTab === target;
    b.classList.toggle("active", active);
    if (active) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  const menuByTab = {
    overview: "sales", daily: "sales", weekly: "sales",
    platforms: "analysis", trends: "analysis", entries: "management", projection: "management", calculator: "tools", roas: "tools"
  };
  document.querySelectorAll("[data-sidebar-menu-trigger]").forEach((trigger) => {
    trigger.classList.toggle("active", trigger.dataset.sidebarMenuTrigger === menuByTab[target]);
  });
  document.querySelectorAll(".dashboard-panel").forEach((p) => {
    const active = p.dataset.dashboardPanel === target;
    p.classList.toggle("active", active);
    p.hidden = !active;
  });
  const pages = {
    overview: ["Desempenho de vendas", "Acompanhe suas vendas e resultados nos marketplaces"], entries: ["Lançamentos", "Registre suas vendas e devoluções por marketplace"],
    daily: ["Vendas diárias", "Acompanhe a evolução das vendas no período"], weekly: ["Semanas", "Compare os resultados de cada semana"],
    platforms: ["Desempenho por plataforma", "Compare o desempenho e acompanhe pedidos"], trends: ["Tendência", "Acompanhe a evolução dos últimos meses"],
    projection: ["Metas e projeção", "Planeje a meta e acompanhe o resultado esperado"], calculator: ["Calculadora de preço", "Simule preço, margem e lucro por plataforma"],
    roas: ["Calculadora de ROAS", "Descubra quanto pode investir em anúncios por pedido"]
  };
  document.getElementById("dashboardPageTitle").textContent = pages[target][0];
  document.getElementById("dashboardPageSubtitle").textContent = pages[target][1];
  document.querySelector(".dashboard-period-controls").hidden = ["calculator", "roas"].includes(target);
  document.getElementById("dashboardRegisterSalesButton").hidden = target !== "overview";
  document.getElementById("dashboardImportSalesButton").hidden = !["overview", "entries", "daily"].includes(target);
  document.getElementById("dashboardScreen").dataset.page = target;
  const k = document.getElementById("kpiRow");
  if (k) k.hidden = target !== "overview";

  // Renderiza a tendência quando a aba é aberta
  if (target === "trends") {
    Promise.all([ensureHistory(), loadCharts()]).then(() => import("./features/trends/trends.ui.js")).then(m => { if (state.activeTab === target) m.init?.(); }).catch(error => toastError(error.message));
  }
  const features = {
    platforms: "./features/platforms/analytics.ui.js",
    calculator: "./features/calculator/pricing.ui.js",
    roas: "./features/calculator/roas.ui.js"
  };
  if (features[target]) {
    const ready = target === "platforms" ? Promise.all([ensureHistory(), loadCharts()]) : Promise.resolve();
    ready.then(() => import(features[target])).then(module => { if (state.activeTab === target) module.init(); }).catch(error => toastError(error.message));
  }
  if (["overview", "daily", "trends", "projection"].includes(target)) loadCharts().then(() => { if (state.activeTab === target) renderAll(); }).catch(error => toastError(error.message));
  if (target === "overview") renderTrackingAlerts();
  renderAll();
}

/* ═══ BOOT ═══ */
async function init() {
  showGlobalLoader();
  initWorkspace();
  hydrateAppIcons();
  bindModalDismiss();
  bindSidebarActions();
  document.getElementById("retryServerLoadButton")?.addEventListener("click", (event) => {
    void retryServerStateLoad(event.currentTarget);
  });
  setupPlatformIconFallbacks();
  initSaveIndicator();
  initTheme();

  const lastSaved = localStorage.getItem("dashboard-vendas-last-saved-v1");
  if (lastSaved) setLastSavedAt(lastSaved);

  let serverStateReady = true;
  if (loadSession()) {
    try {
      renderKpiSkeleton();
      serverStateReady = await loadBusinessStateFromServer({ migrateLocal: true, quiet: true });
    } catch (e) {
      console.error("Falha ao carregar:", e);
      serverStateReady = false;
    }
  }

  if (serverStateReady || !loadSession()) {
    setActiveScreen(state.currentScreen || "hub");
    renderScreen();
  } else {
    document.querySelectorAll(".screen").forEach((screen) => { screen.hidden = true; });
    const errorScreen = document.getElementById("serverLoadErrorScreen");
    if (errorScreen) errorScreen.hidden = false;
  }

  window.addEventListener("beforeunload", () => {
    try { saveState({ localOnly: true }); } catch {}
  });

  hideGlobalLoader();
  //console.log("🔥 main.js: init() concluído");
}

/* ═══ API GLOBAL ═══ */
window.dashboard = {
  renderScreen,
  setActiveScreen,
  getActiveScreen,
  openModal,
  closeModal,
  toast,
  toastSuccess,
  toastError,
  saveState,
  saveNow,
  scheduleServerSave: () => sync.schedule(),
  loadBusinessStateFromServer,
  exportBackup,
  handleLogout,
  openImportBackupModal,
  openSetupScreen,
  openReport,
  renderAll,
  state,
  ensureHistory, ensurePeriod
};

void init();
