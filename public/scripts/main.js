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
  getBusinessSnapshot
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
  selectMonth
} from "./features/sales/sales.ui.js";
import { init as initCalculator } from "./features/calculator/pricing.ui.js";
import { init as initDailyClose } from "./features/daily-close/daily-close.ui.js";
import { init as initBackup, exportBackup } from "./features/backup/backup.export.js";
import { init as initReports, openReport } from "./features/reports/report.builder.js";

// ─── Roteador ───────────────────────────────────────────────────────────────
const KNOWN_SCREENS = ["hub", "dashboard", "calculator", "dailyClose"];
let activeScreen = "hub";
//let serverSaveTimer = null;
// let serverSaveInFlight = false;
// let serverSaveQueued = false;

export function getActiveScreen() { return activeScreen; }

export function setActiveScreen(screen) {
  activeScreen = KNOWN_SCREENS.includes(screen) ? screen : "hub";
  state.currentScreen = activeScreen;
}

export function renderScreen() {
  const screens = {
    auth: document.getElementById("authScreen"),
    setup: document.getElementById("setupScreen"),
    hub: document.getElementById("hubScreen"),
    dashboard: document.getElementById("dashboardScreen"),
    calculator: document.getElementById("calculatorScreen"),
    dailyClose: document.getElementById("dailyCloseScreen")
  };

  const hasAuth = Boolean(state.auth?.username);
  const session = loadSession();
  const isLoggedIn = Boolean(hasAuth && session && session.username === state.auth.username);

  Object.values(screens).forEach((s) => { if (s) s.hidden = true; });

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

  screens.hub.hidden = false;
  initHub();
  initBackup();
  refreshSaveIndicator();
}

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
function bindSidebarActions() {
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

  // 3. Relatório
  document.addEventListener("click", (event) => {
    if (event.target.closest("#reportButton")) {
      event.preventDefault();
      openReport();
    }
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

    // 8. Relatório (bind direto — report.builder pode não ter rodado ainda)
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#reportButton")) return;
    event.preventDefault();
    if (typeof window.dashboard?.openReport === "function") {
      window.dashboard.openReport();
    } else {
      import("./features/reports/report.builder.js")
        .then((m) => m.openReport?.())
        .catch((e) => console.error("Falha ao abrir relatório:", e));
    }
  });

    // 10. Relatório (fallback)
  document.addEventListener("click", (event) => {
    if (event.target.closest("#reportButton")) {
      event.preventDefault();
      if (typeof window.dashboard?.openReport === "function") {
        window.dashboard.openReport();
      } else {
        // Importa dinamicamente e abre
        import("./features/reports/report.builder.js").then((m) => m.openReport?.());
      }
    }
  });

  // 8. Relatório — delegação (sobrevive a re-render)
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#reportButton")) return;
    event.preventDefault();
    window.dashboard?.openReport?.();
  });  
}

export function switchDashboardTab(name) {
  const valid = ["overview", "daily", "weekly", "platforms", "trends", "entries", "projection"];
  const target = valid.includes(name) ? name : "overview";

  state.activeTab = target;
  saveState();

  document.querySelectorAll(".sidebar-item[data-dashboard-tab]").forEach((b) => {
    b.classList.toggle("active", b.dataset.dashboardTab === target);
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

  const reportBtn = document.getElementById("reportButton");
  if (reportBtn) {
    reportBtn.addEventListener("click", (e) => {
      e.preventDefault();
      window.dashboard?.openReport?.();
    });
    console.log("[boot] #reportButton ligado");
  } else {
    console.warn("[boot] #reportButton não existe ainda — será ligado pelo dashboard");
  }

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

  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  document.body.classList.toggle("dark-theme", prefersDark);
  document.body.classList.toggle("light-theme", !prefersDark);

  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    document.body.classList.toggle("dark-theme", e.matches);
    document.body.classList.toggle("light-theme", !e.matches);
  });

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