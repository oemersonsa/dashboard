module.exports = {
  version: 3,
  name: "goals_table",
  async up(client) {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        month TEXT NOT NULL,
        target REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, month),
        FOREIGN KEY(user_id) REFERENCES users(username) ON DELETE CASCADE
      )
    `);
    await client.execute(`
      CREATE INDEX IF NOT EXISTS idx_goals_user_month ON goals(user_id, month)
    `);
  }
};