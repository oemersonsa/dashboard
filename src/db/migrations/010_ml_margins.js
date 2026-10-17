module.exports = {
  version: 10,
  name: "ml_order_margins",
  async up(client) {
    await client.batch(["ml_financials", "ml_order_costs"].map(table => `CREATE TABLE IF NOT EXISTS ${table} (
      user_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      seller_id TEXT NOT NULL, order_id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, seller_id, order_id)
    )`), "write");
  }
};
