const { queryOne, execute } = require("../index");
const { nowIso } = require("../../utils/dates");

function mapRow(row) {
  if (!row) return null;
  return {
    provider: "local",
    passwordHash: row.password_hash || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function get(username) {
  if (!username) return null;
  const row = await queryOne("SELECT * FROM users WHERE username = ?", [username]);
  return mapRow(row);
}

async function save(username, record) {
  const existing = await get(username);
  const createdAt = record.createdAt || existing?.createdAt || nowIso();
  const updatedAt = record.updatedAt || nowIso();

  await execute(`
    INSERT INTO users (username, provider, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      provider = excluded.provider,
      password_hash = excluded.password_hash,
      updated_at = excluded.updated_at
  `, [
    username,
    "local",
    record.passwordHash || null,
    createdAt,
    updatedAt
  ]);
}

module.exports = { get, save };