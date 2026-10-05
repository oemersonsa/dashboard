import { state, saveState, normalizeState } from "../../core/state.js";
import { apiRequest, saveSession, clearSession, loadSession } from "../../core/api.js";
import { MARKETPLACE_PRICING_PRESETS } from "../../core/constants.js";
import { toast, toastSuccess, toastError } from "../../ui/toast.js";

let authMode = "login";
let bound = false;

export function init() {
  render();
  if (!bound) { bindEvents(); bound = true; }
}

function render() {
  const u = document.getElementById("authUsername");
  const p = document.getElementById("authPassword");
  const sb = document.getElementById("authSubmitButton");
  const at = document.getElementById("authTitle");
  const as = document.getElementById("authSubtitle");
  const hint = document.getElementById("authPasswordHint");

  const hasExisting = Boolean(state.auth?.username);
  if (!authMode || (hasExisting && authMode === "create")) {
    authMode = hasExisting ? "login" : "create";
  }

  document.getElementById("authModeLoginButton")
    ?.classList.toggle("active", authMode === "login");
  document.getElementById("authModeCreateButton")
    ?.classList.toggle("active", authMode === "create");

  if (at) at.textContent = authMode === "create" ? "Criar acesso" : "Fazer login";
  if (as) as.textContent = authMode === "create"
    ? "Crie um acesso local simples para proteger seu dashboard nesta maquina."
    : "Use seu acesso local para entrar no dashboard.";
  if (sb) sb.textContent = authMode === "create" ? "Criar acesso" : "Entrar";

  if (u) {
    u.value = authMode === "create" ? "" : (state.auth?.username || "");
    u.placeholder = state.auth?.username || "Seu usuario";
  }
  if (p) p.value = "";
  if (p) {
    p.autocomplete = authMode === "create" ? "new-password" : "current-password";
    p.minLength = authMode === "create" ? 12 : 0;
  }
  if (hint) hint.hidden = authMode !== "create";
}

function bindEvents() {
  document.getElementById("authModeLoginButton")
    ?.addEventListener("click", () => { authMode = "login"; render(); });
  document.getElementById("authModeCreateButton")
    ?.addEventListener("click", () => { authMode = "create"; render(); });
  document.getElementById("authSubmitButton")
    ?.addEventListener("click", handleSubmit);

  ["authUsername", "authPassword"].forEach((id) => {
    document.getElementById(id)?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); handleSubmit(); }
    });
  });
}

async function handleSubmit() {
  const username = document.getElementById("authUsername")?.value.trim();
  const password = document.getElementById("authPassword")?.value;
  if (!username || !password) return toastError("Preencha usuário e senha");

  if (authMode === "create") {
    if (password.length < 12) return toastError("Use uma senha com pelo menos 12 caracteres.");
    try {
      const r = await apiRequest("/api/auth/register", {
        method: "POST",
        requiresAuth: false,
        body: JSON.stringify({ username, password })
      });
      if (!r?.sessionToken) return toastError("Erro ao criar acesso");

      // A conta nova começa sem dados de negócio herdados da sessão anterior.
      state.platforms = [];
      state.db = {};
      state.goals = {};
      state.auth = { provider: "local", username, password: "" };
      saveSession(username, "local", r.sessionToken);
      saveState({ localOnly: true });

      if (!await window.dashboard.loadBusinessStateFromServer()) return;
      // A conta nova começa com o estado vazio confirmado pelo servidor.
      // O renderScreen vai detectar platforms.length === 0 e ir para setup.

      toastSuccess("Acesso criado com sucesso");
      window.dashboard.setActiveScreen("hub");
      window.dashboard.renderScreen();
    } catch (e) {
      toastError(e?.message === "user_already_exists"
        ? "Esse usuário já existe"
        : "Não foi possível criar o acesso");
    }
    return;
  }

  // Login
  try {
    const r = await apiRequest("/api/auth/login", {
      method: "POST",
      requiresAuth: false,
      body: JSON.stringify({ username, password })
    });
    if (!r?.sessionToken) return toastError("Erro ao fazer login");

    state.auth = { provider: "local", username, password: "" };
    saveSession(username, "local", r.sessionToken);
    saveState({ localOnly: true });

    const loaded = await loadRemoteState();
    if (!loaded) return;

    window.dashboard.setActiveScreen("hub");
    window.dashboard.renderScreen();
  } catch {
    toastError("Usuário ou senha inválidos");
  }
}

async function loadRemoteState() {
  return window.dashboard.loadBusinessStateFromServer();
}

export async function handleLogout() {
  const session = loadSession();
  if (session?.serverSessionToken) {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch (e) {
      console.warn("Falha ao encerrar sessão:", e);
    }
  }
  clearSession();
  state.auth = null;
  state.platforms = [];
  state.db = {};
  state.goals = {};
  window.dashboard.setActiveScreen("hub");
  window.dashboard.renderScreen();
}
