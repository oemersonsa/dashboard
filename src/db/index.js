const fs = require("fs");
const path = require("path");
const { createClient } = require("@libsql/client");
const config = require("../config/env");
const logger = require("../utils/logger");

if (!config.TURSO_DATABASE_URL) {
  throw new Error(
    "TURSO_DATABASE_URL não configurada. " +
    "Crie um banco no Turso e defina as variáveis de ambiente."
  );
}

const client = createClient({
  url: config.TURSO_DATABASE_URL,
  authToken: config.TURSO_AUTH_TOKEN || undefined
});

/* ═══ MIGRATIONS ═══ */
async function ensureMigrationsTable() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);
}

async function getAppliedVersions() {
  const result = await client.execute("SELECT version FROM schema_migrations");
  return new Set(result.rows.map((r) => Number(r.version)));
}

async function runMigrations() {
  await ensureMigrationsTable();

  const migrationsDir = path.join(__dirname, "migrations");
  if (!fs.existsSync(migrationsDir)) {
    logger.warn("Pasta de migrations não encontrada — pulando", { path: migrationsDir });
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".js"))
    .sort();

  if (!files.length) {
    logger.warn("Nenhuma migration encontrada");
    return;
  }

  const applied = await getAppliedVersions();

  for (const file of files) {
    const migration = require(path.join(migrationsDir, file));
    if (applied.has(migration.version)) continue;

    logger.info(`Applying migration ${migration.version} - ${migration.name}`);
    try {
      await migration.up(client);
      await client.execute({
        sql: "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
        args: [migration.version, migration.name, new Date().toISOString()]
      });
    } catch (error) {
      logger.error(`Migration ${migration.version} falhou`, { error: error.message });
      throw error;
    }
  }
}

/* ═══ HELPERS ═══ */
// Executa múltiplos statements em uma transação
async function withTransaction(fn) {
  const tx = await client.transaction("write");
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  }
}

// Atalho para SELECT que retorna 1 linha
async function queryOne(sql, args = []) {
  const result = await client.execute({ sql, args });
  return result.rows[0] || null;
}

// Atalho para SELECT que retorna várias linhas
async function queryAll(sql, args = []) {
  const result = await client.execute({ sql, args });
  return result.rows;
}

// Atalho para INSERT/UPDATE/DELETE
async function execute(sql, args = []) {
  return client.execute({ sql, args });
}

module.exports = {
  client,
  runMigrations,
  withTransaction,
  queryOne,
  queryAll,
  execute
};