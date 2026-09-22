const { readJsonBody } = require("../middleware/body-parser");
const auth = require("../services/auth.service");
const sessions = require("../services/sessions.service");

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

/* ═══ LOGIN ═══ */
async function login(req, res) {
  const body = await readJsonBody(req);
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");

  if (!username || !password) {
    return sendJson(res, 400, { error: "username_and_password_required" });
  }

  const user = await auth.getUser(username);
  if (!user || user.provider !== "local" || !auth.verifyPassword(password, user.passwordHash)) {
    return sendJson(res, 401, { error: "invalid_credentials" });
  }

  const token = await sessions.create(username);       // ⬅️ await
  sendJson(res, 200, { sessionToken: token });
}

/* ═══ REGISTER ═══ */
async function register(req, res) {
  const body = await readJsonBody(req);
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");

  if (!username || !password) {
    return sendJson(res, 400, { error: "username_and_password_required" });
  }
  if (password.length < 4) {
    return sendJson(res, 400, { error: "password_too_short" });
  }

  const existing = await auth.getUser(username);
  if (existing?.passwordHash) {
    return sendJson(res, 409, { error: "user_already_exists" });
  }

  await auth.saveUser(username, {
    provider: "local",
    passwordHash: auth.hashPassword(password),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const token = await sessions.create(username);       // ⬅️ await
  sendJson(res, 200, { sessionToken: token });
}

/* ═══ MIGRATE LOCAL ═══ */
async function migrateLocal(req, res) {
  const body = await readJsonBody(req);
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");

  if (!username || !password) {
    return sendJson(res, 400, { error: "username_and_password_required" });
  }

  const existing = await auth.getUser(username);
  if (!existing) {
    await auth.saveUser(username, {
      provider: "local",
      passwordHash: auth.hashPassword(password),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return sendJson(res, 200, { ok: true, migrated: true });
  }
  if (existing.provider !== "local") {
    return sendJson(res, 409, { error: "provider_mismatch" });
  }
  if (!auth.verifyPassword(password, existing.passwordHash)) {
    return sendJson(res, 409, { error: "migration_password_mismatch" });
  }
  sendJson(res, 200, { ok: true, migrated: false });
}

/* ═══ LOGOUT ═══ */
async function logout(req, res) {
  const { extractToken } = require("../middleware/auth");
  const token = extractToken(req);
  if (token) await sessions.remove(token);             // ⬅️ await
  sendJson(res, 200, { ok: true });
}

/* ═══ CHANGE PASSWORD ═══ */
async function changePassword(req, res, authenticatedUser) {
  const body = await readJsonBody(req);
  const username = String(body?.username || "").trim();
  const currentPassword = String(body?.currentPassword || "");
  const newPassword = String(body?.newPassword || "");

  if (!username || !currentPassword || !newPassword) {
    return sendJson(res, 400, { error: "username_current_and_new_password_required" });
  }
  if (authenticatedUser !== username) {
    return sendJson(res, 403, { error: "forbidden" });
  }
  if (newPassword.length < 4) {
    return sendJson(res, 400, { error: "password_too_short" });
  }

  const user = await auth.getUser(username);
  if (!user || user.provider !== "local") {
    return sendJson(res, 404, { error: "local_user_not_found" });
  }
  if (!auth.verifyPassword(currentPassword, user.passwordHash)) {
    return sendJson(res, 401, { error: "invalid_current_password" });
  }

  await auth.saveUser(username, {
    ...user,
    passwordHash: auth.hashPassword(newPassword),
    updatedAt: new Date().toISOString()
  });

  // Remove todas as sessões antigas (força novo login)
  await sessions.removeAllForUser(username);

  sendJson(res, 200, { ok: true });
}

/* ═══ SESSION ═══ */
async function session(req, res) {
  const { extractToken } = require("../middleware/auth");
  const token = extractToken(req);
  const username = await sessions.validate(token);     // ⬅️ await
  if (!username) return sendJson(res, 401, { error: "unauthorized" });
  sendJson(res, 200, { username });
}

module.exports = { login, register, migrateLocal, logout, changePassword, session };