module.exports = {
  version: 2,
  name: "sessions_table",
  async up(client) {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY(username) REFERENCES users(username) ON DELETE CASCADE
      )
    `);
    await client.execute(`
      CREATE INDEX IF NOT EXISTS idx_sessions_username ON sessions(username)
    `);
    await client.execute(`
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)
    `);
  }
};