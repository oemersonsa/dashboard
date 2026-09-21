const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { DATA_DIR, DB_FILE, LEGACY_USER_STORE_FILE } = require("../config/paths");
const logger = require("../utils/logger");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

let db = new DatabaseSync(DB_FILE);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

function reopenDb() {
  try { db.close(); } catch {}
  db = new DatabaseSync(DB_FILE);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations();
}

// ─── Migrations ──────────────────────────────────────────────────────────────
function ensureMigrationsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

function getAppliedVersions() {
  ensureMigrationsTable();
  return new Set(
    db.prepare("SELECT version FROM schema_migrations").all().map((r) => r.version)
  );
}

function runMigrations() {
  const migrationsDir = path.join(__dirname, "migrations");

  if (!fs.existsSync(migrationsDir)) {
    logger.warn("Pasta de migrations não encontrada — pulando migrations", {
      path: migrationsDir
    });
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".js"))
    .sort();

  if (!files.length) {
    logger.warn("Nenhuma migration encontrada");
    return;
  }

  const applied = getAppliedVersions();

  files.forEach((file) => {
    const migration = require(path.join(migrationsDir, file));
    if (applied.has(migration.version)) return;
    logger.info(`Applying migration ${migration.version} - ${migration.name}`);
    db.exec("BEGIN");
    try {
      migration.up(db);
      db.prepare(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)"
      ).run(migration.version, migration.name, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  });
}

// ─── Transaction helper ─────────────────────────────────────────────────────
function withTransaction(fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// ─── Fechar banco (para testes) ─────────────────────────────────────────────
function closeDb() {
  try {
    db.close();
  } catch (e) {
    // já fechado ou nunca aberto — ignora
  }
}

// ─── Legacy data migrations ─────────────────────────────────────────────────
function migrateLegacyUsers(saveUserRecord) {
  if (!fs.existsSync(LEGACY_USER_STORE_FILE)) return;
  let legacy = null;
  try {
    legacy = JSON.parse(fs.readFileSync(LEGACY_USER_STORE_FILE, "utf8"));
  } catch {
    return;
  }
  Object.entries(legacy.users || {}).forEach(([username, user]) => {
    if (!username) return;
    const existing = db.prepare("SELECT username FROM users WHERE username = ?").get(username);
    if (existing) return;
    saveUserRecord(username, {
      provider: "local",
      passwordHash: user.passwordHash || "",
      createdAt: user.createdAt || new Date().toISOString(),
      updatedAt: user.updatedAt || new Date().toISOString()
    });
  });
}

runMigrations();
try { db.exec("DROP TABLE IF EXISTS net_sales"); } catch {}

module.exports = {
  db,
  withTransaction,
  migrateLegacyUsers,
  closeDb,
  nowIso: () => new Date().toISOString()
};