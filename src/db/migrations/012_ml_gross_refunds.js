module.exports = {
  version: 12,
  name: "ml_gross_sales_and_daily_refunds",
  async up(client) {
    await client.batch([
      "ALTER TABLE sales ADD COLUMN refund_amount REAL NOT NULL DEFAULT 0",
      "ALTER TABLE ml_sync_windows ADD COLUMN metrics_version INTEGER NOT NULL DEFAULT 0"
    ], "write");
  }
};
