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
  if (password.length < 12) {
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
  if (password.length < 12) {
    return sendJson(res, 400, { error: "password_too_short" });
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

/* ═══ PROFILE ═══ */
async function getProfile(req, res, authenticatedUser) {
  const user = await auth.getUser(authenticatedUser);
  if (!user) return sendJson(res, 404, { error: "user_not_found" });
  sendJson(res, 200, {
    profile: {
      displayName: user.displayName || "",
      avatarData: user.avatarData || ""
    }
  });
}

async function updateProfile(req, res, authenticatedUser) {
  const body = await readJsonBody(req);
  const rawName = String(body?.displayName ?? "").trim();
  if (rawName.length > 60) {
    return sendJson(res, 400, { error: "display_name_too_long" });
  }

  const rawAvatar = body?.avatarData == null ? "" : String(body.avatarData);
  if (rawAvatar.length > 600_000) {
    return sendJson(res, 413, { error: "avatar_too_large" });
  }
  if (rawAvatar && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(rawAvatar)) {
    return sendJson(res, 400, { error: "invalid_avatar_format" });
  }
  if (rawAvatar) {
    const encoded = rawAvatar.slice(rawAvatar.indexOf(",") + 1);
    if (Buffer.from(encoded, "base64").byteLength > 450_000) {
      return sendJson(res, 413, { error: "avatar_too_large" });
    }
  }

  const user = await auth.getUser(authenticatedUser);
  if (!user) return sendJson(res, 404, { error: "user_not_found" });
  await auth.saveUser(authenticatedUser, {
    ...user,
    displayName: rawName,
    avatarData: rawAvatar,
    updatedAt: new Date().toISOString()
  });
  sendJson(res, 200, {
    profile: {
      displayName: rawName,
      avatarData: rawAvatar
    }
  });
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
  if (newPassword.length < 12) {
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

module.exports = { login, register, migrateLocal, logout, getProfile, updateProfile, changePassword, session };
