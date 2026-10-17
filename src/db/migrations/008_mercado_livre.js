module.exports = {
  version: 8,
  name: "mercado_livre",
  async up(client) {
    await client.batch([
      `CREATE TABLE IF NOT EXISTS ml_connections (
        user_id TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
        seller_id TEXT NOT NULL, nickname TEXT NOT NULL, tokens TEXT NOT NULL,
        expires_at INTEGER NOT NULL, generation TEXT NOT NULL,
        refresh_lock_until INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS ml_oauth_states (
        state_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
        verifier TEXT NOT NULL, expires_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS ml_records (
        user_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
        seller_id TEXT NOT NULL, kind TEXT NOT NULL, resource_id TEXT NOT NULL,
        date_created TEXT NOT NULL, payload TEXT NOT NULL, synced_at TEXT NOT NULL,
        PRIMARY KEY(user_id, seller_id, kind, resource_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_ml_records_date ON ml_records(user_id, seller_id, kind, date_created)`
    ], "write");
  }
};
