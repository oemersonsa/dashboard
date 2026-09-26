/* ═══════════════════════════════════════════════════════════════
   ui/theme.js — Gerenciamento de tema (claro/escuro/auto)
   - 3 modos: "auto" (segue sistema), "light", "dark"
   - Persiste em localStorage
   - Aplica classe no <body> e dispara evento "dashboard:theme-change"
   ═══════════════════════════════════════════════════════════════ */

const THEME_KEY = "dashboard-theme-v1";
const VALID_MODES = ["auto", "light", "dark"];

let currentMode = "auto";
let mediaQuery = null;
let bound = false;

/* ═══ Persistência ═══ */
function loadMode() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (VALID_MODES.includes(saved)) return saved;
  } catch {}
  return "auto";
}

function saveMode(mode) {
  try {
    if (mode === "auto") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, mode);
  } catch {}
}

/* ═══ Tema efetivo ═══ */
function resolveEffectiveTheme() {
  if (currentMode === "light") return "light";
  if (currentMode === "dark") return "dark";
  return mediaQuery?.matches ? "dark" : "light";
}

/* ═══ Ícones e labels ═══ */
const ICONS = {
  auto: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`,
  light: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
  dark: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`
};

const LABELS = {
  auto: "Tema: Automático (segue sistema)",
  light: "Tema: Claro",
  dark: "Tema: Escuro"
};

/* ═══ Atualização do DOM ═══ */
function updateToggleButtons() {
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    const iconEl = btn.querySelector("[data-theme-icon]");
    if (iconEl) iconEl.innerHTML = ICONS[currentMode] || ICONS.auto;
    btn.setAttribute("aria-label", LABELS[currentMode] || LABELS.auto);
    btn.setAttribute("title", LABELS[currentMode] || LABELS.auto);
    btn.dataset.themeMode = currentMode;
  });
}

function applyToDom() {
  const effective = resolveEffectiveTheme();
  const isDark = effective === "dark";

  document.body.classList.toggle("dark-theme", isDark);
  document.body.classList.toggle("light-theme", !isDark);

  document.body.dataset.themeMode = currentMode;
  document.body.dataset.themeEffective = effective;

  updateToggleButtons();

  window.dispatchEvent(new CustomEvent("dashboard:theme-change", {
    detail: { mode: currentMode, effective }
  }));
}

/* ═══ Ciclo ═══ */
function cycleMode() {
  const order = ["auto", "light", "dark"];
  const idx = order.indexOf(currentMode);
  const next = order[(idx + 1) % order.length];
  setMode(next);
}

/* ═══ API pública ═══ */
export function setMode(mode) {
  if (!VALID_MODES.includes(mode)) return;
  currentMode = mode;
  saveMode(mode);
  applyToDom();
}

export function getMode() {
  return currentMode;
}

export function getEffectiveTheme() {
  return resolveEffectiveTheme();
}

/* ═══ Bind (idempotente) ═══ */
export function bindThemeToggle() {
  if (bound) return;
  bound = true;

  document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-theme-toggle]");
    if (!btn) return;
    event.preventDefault();
    cycleMode();
  });
}

/* ═══ Init (idempotente) ═══ */
export function initTheme() {
  if (!mediaQuery) {
    mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    mediaQuery?.addEventListener?.("change", () => {
      if (currentMode === "auto") applyToDom();
    });
  }

  currentMode = loadMode();
  applyToDom();
  bindThemeToggle();
}