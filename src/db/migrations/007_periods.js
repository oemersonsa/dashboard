module.exports = {
  version: 7,
  name: "periods_and_logged_days",
  async up(client) {
    await client.batch([
      `CREATE TABLE IF NOT EXISTS periods (user_id TEXT NOT NULL, month TEXT NOT NULL,
        PRIMARY KEY(user_id, month), FOREIGN KEY(user_id) REFERENCES users(username) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS logged_days (user_id TEXT NOT NULL, month TEXT NOT NULL, date TEXT NOT NULL,
        PRIMARY KEY(user_id, month, date), FOREIGN KEY(user_id) REFERENCES users(username) ON DELETE CASCADE)`,
      `INSERT OR IGNORE INTO periods SELECT user_id, month FROM sales`,
      `INSERT OR IGNORE INTO periods SELECT user_id, month FROM returns`,
      `INSERT OR IGNORE INTO periods SELECT user_id, month FROM goals`,
      `INSERT OR IGNORE INTO periods SELECT user_id, current_month FROM app_settings WHERE current_month IS NOT NULL AND current_month <> ''`,
      `INSERT OR IGNORE INTO logged_days SELECT user_id, month, date FROM sales`
    ], "write");
  }
};
