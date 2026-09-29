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
  sortPeriodKeys
} from "./core/state.js";
import { apiRequest, loadSession, saveSession, clearSession } from "./core/api.js";
import { MARKETPLACE_PRICING_PRESETS } from "./core/constants.js";

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
  renderTabs,
  openAddMonth,
  confirmAddMonth,
  refreshMonthPickerForYear,
  selectMonth,
  switchDashboardPeriod
} from "./features/sales/sales.ui.js";
import { init as initCalculator } from "./features/calculator/pricing.ui.js";
import { init as initDailyClose } from "./features/daily-close/daily-close.ui.js";
import { init as initBackup, exportBackup } from "./features/backup/backup.export.js";
import { init as initReports, openReport } from "./features/reports/report.builder.js";
import {
  init as initAccount,
  getCachedAccountProfile,
  loadAccountProfile
} from "./features/account/account.ui.js";

// ─── Roteador ───────────────────────────────────────────────────────────────
const KNOWN_SCREENS = ["hub", "dashboard", "calculator", "dailyClose", "account"];
let activeScreen = "hub";
//let serverSaveTimer = null;
// let serverSaveInFlight = false;
// let serverSaveQueued = false;

export function getActiveScreen() { return activeScreen; }

export function setActiveScreen(screen) {
  activeScreen = KNOWN_SCREENS.includes(screen) ? screen : "hub";
  state.currentScreen = activeScreen === "account" ? "dashboard" : activeScreen;
}

export function renderScreen() {
  const screens = {
    auth: document.getElementById("authScreen"),
    setup: document.getElementById("setupScreen"),
    hub: document.getElementById("hubScreen"),
    dashboard: document.getElementById("dashboardScreen"),
    calculator: document.getElementById("calculatorScreen"),
    dailyClose: document.getElementById("dailyCloseScreen"),
    account: document.getElementById("accountScreen")
  };

  const hasAuth = Boolean(state.auth?.username);
  const session = loadSession();
  const isLoggedIn = Boolean(hasAuth && session && session.username === state.auth.username);

  Object.values(screens).forEach((s) => { if (s) s.hidden = true; });
  closeSidebarSubmenus();
  closeUserPopover();
  closeMobileSidebar();

  if (!isLoggedIn) {
    screens.auth.hidden = false;
    initAuth();
    return;
  }

  if (!state.platforms.length) {
    screens.setup.hidden = false;
    initPlatforms();
    return;
  }

  if (activeScreen === "dashboard") {
    screens.dashboard.hidden = false;
    syncDashboardUserProfile();
    void loadAccountProfile().then(syncDashboardUserProfile);
    initSales();
    initReports();
    initBackup();
    switchDashboardTab(state.activeTab || "overview");
    return;
  }

  if (activeScreen === "calculator") {
    screens.calculator.hidden = false;
    initCalculator();
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
  initBackup();
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

// /* ═══ SERVER PERSISTENCE ═══ */
// function scheduleServerSave() {
//   clearTimeout(serverSaveTimer);
//   setSaveStatus("saving");
//   serverSaveTimer = setTimeout(() => void persistToServer(), 800);
// }

// async function persistToServer() {
//   if (!loadSession()) { setSaveStatus("idle"); return; }
//   if (serverSaveInFlight) { serverSaveQueued = true; return; }
//   serverSaveInFlight = true;

//   // ⬇️ Timeout de 15s
//   const controller = new AbortController();
//   const timeoutId = setTimeout(() => controller.abort(), 15_000);

//   try {
//     await apiRequest("/api/state", {
//       method: "POST",
//       body: JSON.stringify({ state: getBusinessSnapshot() })
//     });
//     const iso = new Date().toISOString();
//     localStorage.setItem("dashboard-vendas-last-saved-v1", iso);
//     setLastSavedAt(iso);
//     setSaveStatus("saved");
//     setTimeout(() => setSaveStatus("idle"), 2000);
//   } catch (error) {
//     console.error("Falha ao salvar no servidor:", error);
//     setSaveStatus("error", "Erro ao salvar");
//     toastError("Não foi possível salvar no servidor");
//   } finally {
//     serverSaveInFlight = false;
//     if (serverSaveQueued) {
//       serverSaveQueued = false;
//       void persistToServer();
//     }
//   }
// }

// window.addEventListener("dashboard:save-request", scheduleServerSave);
// window.addEventListener("dashboard:reload", () => renderScreen());

let serverSaveTimer = null;
let serverSaveInFlight = false;
let serverSaveQueued = false;

function scheduleServerSave() {
  clearTimeout(serverSaveTimer);
  setSaveStatus("saving");
  serverSaveTimer = setTimeout(() => void persistToServer(), 200);
}

/* ═══ SERVER PERSISTENCE (incremental) ═══ */
// Último estado confirmado pelo servidor. null = desconhecido → força salvamento completo.
const synced = { platforms: null, months: new Map(), settings: null };

const jsonOf = (v) => JSON.stringify(v ?? null);
const settingsOf = () => ({
  currentMonth: state.currentMonth,
  currentScreen: state.currentScreen,
  pricing: state.pricing
});

function markSynced() {
  synced.platforms = jsonOf(state.platforms);
  synced.months = new Map(
    Object.entries(state.db).map(([m, d]) => [m, jsonOf(d)])
  );
  synced.settings = jsonOf(settingsOf());
}

async function persistToServer() {
  if (!loadSession()) { setSaveStatus("idle"); return; }
  if (serverSaveInFlight) { serverSaveQueued = true; return; }
  serverSaveInFlight = true;

  try {
    const platformsJson = jsonOf(state.platforms);

    if (synced.platforms !== platformsJson) {
      // Plataformas mudaram (ou 1º save): salvamento completo, raro
      await apiRequest("/api/state", {
        method: "POST",
        body: JSON.stringify({ state: getBusinessSnapshot() })
      });
      markSynced();
    } else {
      const tasks = [];
      const nextMonths = new Map(synced.months);

      for (const [month, data] of Object.entries(state.db)) {
        const json = jsonOf(data);
        if (synced.months.get(month) === json) continue;
        tasks.push(
          apiRequest(`/api/month/${encodeURIComponent(month)}`, {
            method: "POST",
            body: JSON.stringify({ days: data.days, returns: data.returns })
          }).then(() => nextMonths.set(month, json))
        );
      }

      for (const month of synced.months.keys()) {
        if (state.db[month]) continue;
        tasks.push(
          apiRequest(`/api/month/${encodeURIComponent(month)}`, { method: "DELETE" })
            .then(() => nextMonths.delete(month))
        );
      }

      const settingsJson = jsonOf(settingsOf());
      let nextSettings = synced.settings;
      if (settingsJson !== synced.settings) {
        tasks.push(
          apiRequest("/api/settings", { method: "POST", body: settingsJson })
            .then(() => { nextSettings = settingsJson; })
        );
      }

      await Promise.all(tasks);
      synced.months = nextMonths;
      synced.settings = nextSettings;
    }

    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  } catch (error) {
    console.error("Falha ao salvar no servidor:", error);
    setSaveStatus("error", "Erro ao salvar");
    toastError("Não foi possível salvar no servidor");
  } finally {
    serverSaveInFlight = false;
    if (serverSaveQueued) {
      serverSaveQueued = false;
      void persistToServer();
    }
  }
}

window.addEventListener("dashboard:save-request", scheduleServerSave);
window.addEventListener("dashboard:reload", () => renderScreen());

/* ═══ LOAD FROM SERVER ═══ */
async function loadBusinessStateFromServer({ migrateLocal = false } = {}) {
  if (!loadSession()) return false;
  try {
    const result = await apiRequest("/api/state");
    const remote = result?.state || {};
    const normalized = normalizeState(
      {
        ...remote,
        auth: state.auth,
        currentMonth: remote.currentMonth || state.currentMonth,
        currentScreen: remote.currentScreen || state.currentScreen || "hub",
        pricing: remote.pricing || state.pricing
      },
      MARKETPLACE_PRICING_PRESETS
    );
    state.goals = normalized.goals || {}; 
    state.platforms = normalized.platforms;
    state.db = normalized.db;
    state.currentMonth = normalized.currentMonth;
    state.pricing = normalized.pricing;
    state.currentScreen = normalized.currentScreen;
    activeScreen = state.currentScreen || "hub";
    markSynced(); 
    return true;
  } catch (error) {
    console.error("Falha ao carregar dados do servidor:", error);
    if (error.status === 401) { clearSession(); return false; }
    toastError("Não foi possível carregar os dados do servidor");
    return false;
  }
}

/* ═══ AÇÕES GLOBAIS ═══ */
export async function saveNow() {
  saveState({ localOnly: true });
  await persistToServer();
  toastSuccess("Dados salvos no servidor");
}

export async function openImportBackupModal() {
  openModal("importBackupModal");
}

export function openSetupScreen() {
  const screens = {
    auth: document.getElementById("authScreen"),
    setup: document.getElementById("setupScreen"),
    hub: document.getElementById("hubScreen"),
    dashboard: document.getElementById("dashboardScreen"),
    calculator: document.getElementById("calculatorScreen"),
    dailyClose: document.getElementById("dailyCloseScreen")
  };
  Object.values(screens).forEach((s) => { if (s) s.hidden = true; });
  screens.setup.hidden = false;
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
      if (shouldOpen) document.getElementById("openAccountSettingsButton")?.focus();
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

  window.addEventListener("resize", () => closeSidebarSubmenus());
  window.addEventListener("scroll", () => closeSidebarSubmenus(), true);

  // 1. Sidebar
  document.addEventListener("click", (event) => {
    const target = event.target.closest(
      "#sidebarOpenHub, #sidebarOpenDailyClose, #sidebarOpenCalculator, " +
      "#sidebarSaveButton, #sidebarImportBackupButton, #sidebarExportBackupButton"
    );
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    switch (target.id) {
      case "sidebarOpenHub": setActiveScreen("hub"); renderScreen(); break;
      case "sidebarOpenDailyClose": setActiveScreen("dailyClose"); renderScreen(); break;
      case "sidebarOpenCalculator": setActiveScreen("calculator"); renderScreen(); break;
      case "sidebarSaveButton": saveNow(); break;
      case "sidebarImportBackupButton": openImportBackupModal(); break;
      case "sidebarExportBackupButton": exportBackup(); break;
    }
  });

  // 2. Tabs do dashboard
  document.addEventListener("click", (event) => {
    const tab = event.target.closest(".sidebar-item[data-dashboard-tab]");
    if (!tab) return;
    event.preventDefault();
    switchDashboardTab(tab.dataset.dashboardTab);
  });

  // 4. Seletor de período (modal de mês)
  document.addEventListener("click", (event) => {
    if (event.target.closest("#periodPickerButton")) {
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
      const exists = Boolean(state.db[period]);
      if (exists) {
        state.currentMonth = period;
        saveState();
        closeModal("addMonthModal");
        renderTabs();
        renderAll();
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
  });

  // 4b. Input do ano
  document.addEventListener("input", (event) => {
    if (event.target.id === "periodYearInput") {
      refreshMonthPickerForYear();
    }
  });

  // 4c. Seletores rápidos de mês e ano do dashboard
  document.addEventListener("change", (event) => {
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
      const availablePeriods = sortPeriodKeys(Object.keys(state.db).filter((period) => period.startsWith(`${year}-`)));
      const targetPeriod = state.db[sameMonthPeriod]
        ? sameMonthPeriod
        : availablePeriods.at(-1);
      if (targetPeriod) switchDashboardPeriod(year, targetPeriod.slice(5));
    }
  });

  // 5. Hamburger mobile
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#menuToggleButton")) return;
    event.preventDefault();
    const sidebar = document.getElementById("dashboardSidebar");
    if (!sidebar) return;

    let overlay = document.querySelector(".sidebar-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "sidebar-overlay";
      overlay.addEventListener("click", () => {
        sidebar.classList.remove("open");
        overlay.classList.remove("visible");
      });
     document.querySelector(".app")?.appendChild(overlay);
    }
    sidebar.classList.toggle("open");
    overlay.classList.toggle("visible");
  });

  // 6. Topbar das telas calculator/dailyClose
  document.addEventListener("click", (event) => {
    const btn = event.target.closest(
      "#calculatorBackToHubButton, #calculatorOpenDashboardButton, #calculatorManagePlatformsButton, " +
      "#dailyCloseBackToHubButton, #dailyCloseOpenDashboardButton, #dailyCloseManagePlatformsButton"
    );
    if (!btn) return;
    event.preventDefault();
    switch (btn.id) {
      case "calculatorBackToHubButton":
      case "dailyCloseBackToHubButton":
        setActiveScreen("hub"); renderScreen(); break;
      case "calculatorOpenDashboardButton":
      case "dailyCloseOpenDashboardButton":
        setActiveScreen("dashboard"); renderScreen(); break;
      case "calculatorManagePlatformsButton":
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
  const valid = ["overview", "daily", "weekly", "platforms", "trends", "entries", "projection"];
  const target = valid.includes(name) ? name : "overview";

  state.activeTab = target;
  saveState();

  document.querySelectorAll(".sidebar-item[data-dashboard-tab]").forEach((b) => {
    const active = b.dataset.dashboardTab === target;
    b.classList.toggle("active", active);
    if (active) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  const menuByTab = {
    overview: "sales", daily: "sales", weekly: "sales",
    platforms: "analysis", trends: "analysis", entries: "management", projection: "management"
  };
  document.querySelectorAll("[data-sidebar-menu-trigger]").forEach((trigger) => {
    trigger.classList.toggle("active", trigger.dataset.sidebarMenuTrigger === menuByTab[target]);
  });
  document.querySelectorAll(".dashboard-panel").forEach((p) => {
    const active = p.dataset.dashboardPanel === target;
    p.classList.toggle("active", active);
    p.hidden = !active;
  });
  const k = document.getElementById("kpiRow");
  if (k) k.hidden = target !== "overview";

  // Renderiza a tendência quando a aba é aberta
  if (target === "trends") {
    import("./features/trends/trends.ui.js").then((m) => m.init?.()).catch(console.error);
  }
}

/* ═══ BOOT ═══ */
async function init() {
  showGlobalLoader();
  bindModalDismiss();
  bindSidebarActions();
  setupPlatformIconFallbacks();
  initSaveIndicator();
  initTheme();

  const lastSaved = localStorage.getItem("dashboard-vendas-last-saved-v1");
  if (lastSaved) setLastSavedAt(lastSaved);

  if (loadSession()) {
    try {
      renderKpiSkeleton();
      await loadBusinessStateFromServer({ migrateLocal: true });
    } catch (e) {
      console.error("Falha ao carregar:", e);
    }
  }

  setActiveScreen(state.currentScreen || "hub");
  renderScreen();

  window.addEventListener("beforeunload", () => {
    try { saveState({ localOnly: true }); } catch {}
  });

  hideGlobalLoader();
  console.log("🔥 main.js: init() concluído");

  if (loadSession()) {
    await loadBusinessStateFromServer({ migrateLocal: true });
  }

  setActiveScreen(state.currentScreen || "hub");
  renderScreen();

  window.addEventListener("beforeunload", () => {
    try { saveState({ localOnly: true }); } catch {}
  });
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
  scheduleServerSave,
  markSynced,
  exportBackup,
  handleLogout,
  openImportBackupModal,
  openSetupScreen,
  openReport,
  renderAll,
  state
};

void init();
