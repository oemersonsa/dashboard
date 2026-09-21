const { db, nowIso } = require("../index");

function mapRow(row) {
  if (!row) return null;
  return {
    provider: "local",
    passwordHash: row.password_hash || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function get(username) {
  if (!username) return null;
  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  return mapRow(row);
}

function save(username, record) {
  const existing = get(username);
  const createdAt = record.createdAt || existing?.createdAt || nowIso();
  const updatedAt = record.updatedAt || nowIso();
  db.prepare(`
    INSERT INTO users (username, provider, password_hash, created_at, updated_at)
    VALUES (@username, @provider, @passwordHash, @createdAt, @updatedAt)
    ON CONFLICT(username) DO UPDATE SET
      provider = excluded.provider,
      password_hash = excluded.password_hash,
      updated_at = excluded.updated_at
  `).run({
    username,
    provider: "local",
    passwordHash: record.passwordHash || null,
    createdAt,
    updatedAt
  });
}

module.exports = { get, save };