module.exports = {
  version: 1,
  name: "initial_schema",
  async up(client) {
    // O Turso aceita múltiplos statements separados por ;
    // mas executamos em batch para clareza
    const statements = [
      `CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        provider TEXT NOT NULL DEFAULT 'local',
        password_hash TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS platforms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        platform_key TEXT NOT NULL,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        color TEXT NOT NULL,
        icon_text TEXT NOT NULL DEFAULT '#ffffff',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, platform_key),
        FOREIGN KEY(user_id) REFERENCES users(username) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        platform_id INTEGER NOT NULL,
        month TEXT NOT NULL,
        date TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        orders_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, platform_id, month, date),
        FOREIGN KEY(user_id) REFERENCES users(username) ON DELETE CASCADE,
        FOREIGN KEY(platform_id) REFERENCES platforms(id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS returns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        platform_id INTEGER NOT NULL,
        month TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, platform_id, month),
        FOREIGN KEY(user_id) REFERENCES users(username) ON DELETE CASCADE,
        FOREIGN KEY(platform_id) REFERENCES platforms(id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS app_settings (
        user_id TEXT PRIMARY KEY,
        current_month TEXT,
        current_screen TEXT,
        pricing_json TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(username) ON DELETE CASCADE
      )`,

      `CREATE INDEX IF NOT EXISTS idx_sales_user_month ON sales(user_id, month)`,
      `CREATE INDEX IF NOT EXISTS idx_returns_user_month ON returns(user_id, month)`,
      `CREATE INDEX IF NOT EXISTS idx_platforms_user ON platforms(user_id)`
    ];

    for (const sql of statements) {
      await client.execute(sql);
    }
  }
};