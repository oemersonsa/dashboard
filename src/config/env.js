const fs = require("fs");
const path = require("path");
const { PROJECT_ROOT } = require("./paths");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const sep = trimmed.indexOf("=");
    if (sep <= 0) return;
    const key = trimmed.slice(0, sep).trim();
    let value = trimmed.slice(sep + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  });
}

loadEnvFile(path.join(PROJECT_ROOT, ".env"));

const config = {
  PORT: Number(process.env.PORT || 3000),
  HOST: String(process.env.HOST || "0.0.0.0"),
  APP_ORIGIN: String(process.env.APP_ORIGIN || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ""),

  // ─── Turso (banco remoto) ────────────────────────────────────────────
  TURSO_DATABASE_URL: String(process.env.TURSO_DATABASE_URL || "").trim(),
  TURSO_AUTH_TOKEN: String(process.env.TURSO_AUTH_TOKEN || "").trim(),
  TURSO_SYNC_URL: String(process.env.TURSO_SYNC_URL || "").trim(),  // opcional, para embedded replicas

  // ─── Sessões locais (arquivo JSON) ───────────────────────────────────
  SESSION_TTL_MS: 365 * 24 * 60 * 60 * 1000,

  // ─── Rate limit ──────────────────────────────────────────────────────
  RATE_LIMIT_WINDOW_MS: 60_000,
  RATE_LIMIT_MAX: 30,

  // ─── HTTP ────────────────────────────────────────────────────────────
  MAX_BODY_BYTES: 10 * 1024 * 1024
};

module.exports = config;

loadEnvFile(path.join(PROJECT_ROOT, ".env"));

console.log("🔍 TURSO_DATABASE_URL:", process.env.TURSO_DATABASE_URL ? "✓ definida" : "✗ vazia");
console.log("🔍 TURSO_AUTH_TOKEN:", process.env.TURSO_AUTH_TOKEN ? "✓ definida" : "✗ vazia");