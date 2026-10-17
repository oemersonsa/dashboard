module.exports = {
  version: 11,
  name: "ml_auto_sync",
  async up(client) {
    await client.execute(`CREATE TABLE IF NOT EXISTS ml_auto_sync (
      user_id TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
      seller_id TEXT NOT NULL, platform_key TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0,
      lock_id TEXT, lock_until INTEGER NOT NULL DEFAULT 0,
      from_date TEXT, to_date TEXT, next_offset INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TEXT, last_success_at TEXT, last_to_date TEXT, last_error TEXT,
      last_changed_days INTEGER NOT NULL DEFAULT 0
    )`);
  }
};
