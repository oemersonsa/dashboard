/* ═══════════════════════════════════════════════════════════════
   ui/save-indicator.js
   Indicador de save no topbar com estado, tempo decorrido e barra.
   Usa classe (não ID) para permitir múltiplos topbars.
   ═══════════════════════════════════════════════════════════════ */

const STATES = {
  idle:    { label: "Pronto",          cls: "idle" },
  saving:  { label: "Salvando...",     cls: "saving" },
  saved:   { label: "Salvo",           cls: "saved" },
  error:   { label: "Erro ao salvar",  cls: "error" }
};

let currentStatus = "idle";
let currentMessage = "";
let lastSavedAt = null;
let tickTimer = null;
let autoIdleTimer = null;

/* ═══ Init ═══ */
export function initSaveIndicator() {
  injectAll();
  startTicker();
  updateUi();
}

/* ═══ Injeção em TODOS os topbars ═══ */
function injectAll() {
  const topbars = document.querySelectorAll(".topbar");

  topbars.forEach((topbar) => {
    if (topbar.querySelector(".save-indicator")) return;

    const el = document.createElement("button");
    el.type = "button";
    el.className = "save-indicator";
    el.dataset.status = "idle";
    el.title = "Clique para salvar ou tentar novamente";
    el.setAttribute("aria-label", "Status da sincronização. Clique para salvar ou tentar novamente.");
    el.innerHTML = `
      <span class="save-indicator-dot"></span>
      <span class="save-indicator-text">Pronto</span>
      <span class="save-indicator-time"></span>
    `;
    el.addEventListener("click", () => {
      if (currentStatus === "saving") return;
      void window.dashboard?.saveNow?.();
    });

    let right = topbar.querySelector(".header-right");
    if (!right) {
      right = document.createElement("div");
      right.className = "header-right";
      topbar.appendChild(right);
    }
    // Coloca como primeiro item do header-right (antes dos botões)
    right.insertBefore(el, right.firstChild);
  });
}

/* ═══ Ticker de tempo ═══ */
function startTicker() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    if (currentStatus === "saved" || currentStatus === "idle") {
      updateUi();
    }
  }, 30_000);
}

/* ═══ Formatação de tempo ═══ */
function formatElapsed(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const diff = Math.max(0, Date.now() - d.getTime());
  const sec = Math.floor(diff / 1000);
  if (sec < 5)    return "agora";
  if (sec < 60)   return `há ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60)   return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)     return `há ${h}h`;
  return "ontem";
}

/* ═══ Atualiza TODOS os indicadores ═══ */
function updateUi() {
  const els = document.querySelectorAll(".save-indicator");
  const state = STATES[currentStatus] || STATES.idle;
  const elapsed = lastSavedAt ? formatElapsed(lastSavedAt) : "";

  els.forEach((el) => {
    el.dataset.status = currentStatus;
    el.setAttribute("aria-label", `${currentMessage || state.label}. Clique para salvar ou tentar novamente.`);

    const textEl = el.querySelector(".save-indicator-text");
    const timeEl = el.querySelector(".save-indicator-time");

    if (textEl) textEl.textContent = currentMessage || state.label;

    if (timeEl) {
      if (currentStatus === "saved" || currentStatus === "idle") {
        timeEl.textContent = elapsed ? `· ${elapsed}` : "";
      } else if (currentStatus === "saving") {
        timeEl.textContent = "";
      } else if (currentStatus === "error") {
        timeEl.textContent = "· tentar novamente";
      }
    }
  });
}

/* ═══ API pública ═══ */
export function setSaveStatus(status, message = "") {
  currentStatus = STATES[status] ? status : "idle";
  currentMessage = String(message || "");

  if (status === "saved") {
    lastSavedAt = new Date().toISOString();

    clearTimeout(autoIdleTimer);
    autoIdleTimer = setTimeout(() => {
      if (currentStatus === "saved") {
        currentStatus = "idle";
        updateUi();
      }
    }, 4000);
  }

  updateUi();
}

export function refreshSaveIndicator() {
  injectAll();
  updateUi();
}

export function setLastSavedAt(iso) {
  if (iso) {
    lastSavedAt = iso;
    updateUi();
  }
}
