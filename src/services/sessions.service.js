const crypto = require("crypto");
const { queryOne, execute } = require("../db");
const config = require("../config/env");
const logger = require("../utils/logger");

function nowIso() {
  return new Date().toISOString();
}

function expiresIso() {
  return new Date(Date.now() + config.SESSION_TTL_MS).toISOString();
}

async function create(username) {
  const token = crypto.randomBytes(32).toString("hex");
  await execute(`
    INSERT INTO sessions (token, username, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `, [token, username, nowIso(), expiresIso()]);
  return token;
}

async function validate(token) {
  if (!token) return null;
  const row = await queryOne(`
    SELECT username, expires_at FROM sessions WHERE token = ?
  `, [token]);

  if (!row) return null;

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await execute("DELETE FROM sessions WHERE token = ?", [token]);
    return null;
  }

  return row.username;
}

async function remove(token) {
  if (!token) return;
  await execute("DELETE FROM sessions WHERE token = ?", [token]);
}

async function removeAllForUser(username) {
  await execute("DELETE FROM sessions WHERE username = ?", [username]);
}

async function cleanupExpired() {
  try {
    await execute("DELETE FROM sessions WHERE expires_at < ?", [nowIso()]);
  } catch (error) {
    logger.error("Falha ao limpar sessões expiradas", { error: error.message });
  }
}

module.exports = { create, validate, remove, removeAllForUser, cleanupExpired };