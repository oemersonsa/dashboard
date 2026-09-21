const { readJsonBody } = require("../middleware/body-parser");
const auth = require("../services/auth.service");
const sessions = require("../services/sessions.service");
const { Errors } = require("../utils/errors");

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

async function login(req, res) {
  const body = await readJsonBody(req);
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  if (!username || !password) return sendJson(res, 400, { error: "username_and_password_required" });
  const user = auth.getUser(username);
  if (!user || user.provider !== "local" || !auth.verifyPassword(password, user.passwordHash)) {
    return sendJson(res, 401, { error: "invalid_credentials" });
  }
  const token = sessions.create(username);
  sendJson(res, 200, { sessionToken: token });
}

async function register(req, res) {
  const body = await readJsonBody(req);
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  if (!username || !password) return sendJson(res, 400, { error: "username_and_password_required" });
  if (password.length < 4) return sendJson(res, 400, { error: "password_too_short" });
  const existing = auth.getUser(username);
  if (existing?.passwordHash) return sendJson(res, 409, { error: "user_already_exists" });
  auth.saveUser(username, {
    provider: "local",
    passwordHash: auth.hashPassword(password),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  const token = sessions.create(username);
  sendJson(res, 200, { sessionToken: token });
}

async function migrateLocal(req, res) {
  const body = await readJsonBody(req);
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  if (!username || !password) return sendJson(res, 400, { error: "username_and_password_required" });
  const existing = auth.getUser(username);
  if (!existing) {
    auth.saveUser(username, {
      provider: "local",
      passwordHash: auth.hashPassword(password),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return sendJson(res, 200, { ok: true, migrated: true });
  }
  if (existing.provider !== "local") return sendJson(res, 409, { error: "provider_mismatch" });
  if (!auth.verifyPassword(password, existing.passwordHash)) {
    return sendJson(res, 409, { error: "migration_password_mismatch" });
  }
  sendJson(res, 200, { ok: true, migrated: false });
}

async function logout(req, res) {
  const { extractToken } = require("../middleware/auth");
  const token = extractToken(req);
  if (token) sessions.remove(token);
  sendJson(res, 200, { ok: true });
}

async function changePassword(req, res, authenticatedUser) {
  const body = await readJsonBody(req);
  const username = String(body?.username || "").trim();
  const currentPassword = String(body?.currentPassword || "");
  const newPassword = String(body?.newPassword || "");
  if (!username || !currentPassword || !newPassword) {
    return sendJson(res, 400, { error: "username_current_and_new_password_required" });
  }
  if (authenticatedUser !== username) return sendJson(res, 403, { error: "forbidden" });
  if (newPassword.length < 4) return sendJson(res, 400, { error: "password_too_short" });
  const user = auth.getUser(username);
  if (!user || user.provider !== "local") return sendJson(res, 404, { error: "local_user_not_found" });
  if (!auth.verifyPassword(currentPassword, user.passwordHash)) {
    return sendJson(res, 401, { error: "invalid_current_password" });
  }
  auth.saveUser(username, {
    ...user,
    passwordHash: auth.hashPassword(newPassword),
    updatedAt: new Date().toISOString()
  });
  sendJson(res, 200, { ok: true });
}

async function session(req, res) {
  const { extractToken } = require("../middleware/auth");
  const token = extractToken(req);
  const username = sessions.validate(token);
  if (!username) return sendJson(res, 401, { error: "unauthorized" });
  sendJson(res, 200, { username });
}

module.exports = { login, register, migrateLocal, logout, changePassword, session };