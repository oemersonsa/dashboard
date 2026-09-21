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
    try {
      const r = await apiRequest("/api/auth/register", {
        method: "POST",
        requiresAuth: false,
        body: JSON.stringify({ username, password })
      });
      if (!r?.sessionToken) return toastError("Erro ao criar acesso");

      state.auth = { provider: "local", username, password: "" };
      saveSession(username, "local", r.sessionToken);
      saveState({ localOnly: true });

      // ⬇️ NÃO chama loadRemoteState: usuário novo, servidor está vazio.
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

    await loadRemoteState();

    window.dashboard.setActiveScreen("hub");
    window.dashboard.renderScreen();
  } catch {
    toastError("Usuário ou senha inválidos");
  }
}

async function loadRemoteState() {
  try {
    const result = await apiRequest("/api/state");
    const remote = result?.state || {};
    const normalized = normalizeState(
      { ...remote, auth: state.auth, pricing: remote.pricing || state.pricing },
      MARKETPLACE_PRICING_PRESETS
    );
    Object.assign(state, {
      platforms: normalized.platforms,
      db: normalized.db,
      currentMonth: normalized.currentMonth,
      pricing: normalized.pricing,
      currentScreen: normalized.currentScreen
    });
  } catch (e) {
    console.error("Falha ao carregar state:", e);
  }
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
  window.dashboard.setActiveScreen("hub");
  window.dashboard.renderScreen();
}