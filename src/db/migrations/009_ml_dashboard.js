module.exports = {
  version: 9,
  name: "ml_dashboard_sync_windows",
  async up(client) {
    await client.batch([
      "ALTER TABLE ml_records ADD COLUMN sync_id TEXT NOT NULL DEFAULT ''",
      `CREATE TABLE IF NOT EXISTS ml_sync_windows (
        user_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
        seller_id TEXT NOT NULL, from_date TEXT NOT NULL, to_date TEXT NOT NULL,
        run_id TEXT NOT NULL, next_offset INTEGER, completed_at TEXT,
        PRIMARY KEY(user_id, seller_id, from_date, to_date)
      )`
    ], "write");
  }
};
