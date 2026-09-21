import { SESSION_KEY } from "./constants.js";

let sessionCache = null;

export function loadSession() {
  if (sessionCache) return sessionCache;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.username || !parsed?.expiresAt) return null;
    if (Date.now() > Number(parsed.expiresAt)) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    const tok = String(parsed.serverSessionToken || "").trim();
    if (!tok) return null;
    sessionCache = {
      username: String(parsed.username),
      provider: "local",
      serverSessionToken: tok
    };
    return sessionCache;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function saveSession(username, provider, serverSessionToken) {
  const safe = String(serverSessionToken || "").trim();
  sessionCache = { username, provider: "local", serverSessionToken: safe };
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    username, provider: "local", serverSessionToken: safe,
    expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000
  }));
}

export function clearSession() {
  sessionCache = null;
  localStorage.removeItem(SESSION_KEY);
}

export function getServerSessionToken() {
  return String(loadSession()?.serverSessionToken || "").trim();
}

export async function apiRequest(path, options = {}) {
  const tok = getServerSessionToken();
  const extra = options.requiresAuth === false || !tok
    ? {} : { Authorization: `Bearer ${tok}` };
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...extra,
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const err = new Error(data?.error || `backend_request_failed_${response.status}`);
    err.status = response.status;
    throw err;
  }
  return data;
}