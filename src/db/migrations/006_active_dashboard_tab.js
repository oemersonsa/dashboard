module.exports = {
  version: 6,
  name: "active_dashboard_tab",
  async up(client) {
    await client.execute("ALTER TABLE app_settings ADD COLUMN active_tab TEXT NOT NULL DEFAULT 'overview'");
  }
};
