const fs = require("fs");
const crypto = require("crypto");
const { SESSION_STORE_FILE, DATA_DIR } = require("../config/paths");
const { SESSION_TTL_MS } = require("../config/env");

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readStore() {
  ensureDataDir();
  if (!fs.existsSync(SESSION_STORE_FILE)) return { sessions: {} };
  try {
    return JSON.parse(fs.readFileSync(SESSION_STORE_FILE, "utf8"));
  } catch {
    return { sessions: {} };
  }
}

function writeStore(store) {
  ensureDataDir();
  const tmp = SESSION_STORE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, SESSION_STORE_FILE);
}

function create(username) {
  const token = crypto.randomBytes(32).toString("hex");
  const store = readStore();
  if (!store.sessions) store.sessions = {};
  store.sessions[token] = { username, createdAt: Date.now() };
  writeStore(store);
  return token;
}

function validate(token) {
  if (!token) return null;
  const store = readStore();
  const session = store.sessions?.[String(token)];
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    delete store.sessions[token];
    writeStore(store);
    return null;
  }
  return session.username;
}

function remove(token) {
  if (!token) return;
  const store = readStore();
  if (store.sessions?.[token]) {
    delete store.sessions[token];
    writeStore(store);
  }
}

function cleanupExpired() {
  const store = readStore();
  const now = Date.now();
  let changed = false;
  for (const [token, session] of Object.entries(store.sessions || {})) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      delete store.sessions[token];
      changed = true;
    }
  }
  if (changed) writeStore(store);
}

module.exports = { create, validate, remove, cleanupExpired };