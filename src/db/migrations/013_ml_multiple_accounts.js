module.exports = {
  version: 13,
  name: "ml_multiple_accounts",
  async up(database) {
    const client = await database.transaction("write");
    try {
      await client.execute(`CREATE TABLE ml_connections_multi (
        user_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
        seller_id TEXT NOT NULL, nickname TEXT NOT NULL, tokens TEXT NOT NULL,
        expires_at INTEGER NOT NULL, generation TEXT NOT NULL,
        refresh_lock_until INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(user_id, seller_id)
      )`);
      await client.execute("INSERT INTO ml_connections_multi SELECT * FROM ml_connections");
      await client.execute("DROP TABLE ml_connections");
      await client.execute("ALTER TABLE ml_connections_multi RENAME TO ml_connections");
      await client.execute(`CREATE TABLE ml_auto_sync_multi (
        user_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
        seller_id TEXT NOT NULL, platform_key TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0,
        lock_id TEXT, lock_until INTEGER NOT NULL DEFAULT 0,
        from_date TEXT, to_date TEXT, next_offset INTEGER NOT NULL DEFAULT 0,
        last_attempt_at TEXT, last_success_at TEXT, last_to_date TEXT, last_error TEXT,
        last_changed_days INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(user_id, seller_id), UNIQUE(user_id, platform_key)
      )`);
      await client.execute(`INSERT INTO ml_auto_sync_multi SELECT a.* FROM ml_auto_sync a
        JOIN ml_connections c ON c.user_id=a.user_id AND c.seller_id=a.seller_id`);
      await client.execute("DROP TABLE ml_auto_sync");
      await client.execute("ALTER TABLE ml_auto_sync_multi RENAME TO ml_auto_sync");
      await client.execute("ALTER TABLE ml_oauth_states ADD COLUMN seller_id TEXT");
      await client.commit();
    } catch (error) { await client.rollback(); throw error; }
    finally { client.close(); }
  }
};
