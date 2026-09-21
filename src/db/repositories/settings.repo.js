const { queryOne, execute } = require("../index");

async function get(userId) {
  return queryOne("SELECT * FROM app_settings WHERE user_id = ?", [userId]);
}

async function save(userId, settings, timestamp) {
  await execute(`
    INSERT INTO app_settings (user_id, current_month, current_screen, pricing_json, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      current_month = excluded.current_month,
      current_screen = excluded.current_screen,
      pricing_json = excluded.pricing_json,
      updated_at = excluded.updated_at
  `, [
    userId,
    settings.currentMonth || "",
    settings.currentScreen || "hub",
    JSON.stringify(settings.pricing || null),
    timestamp
  ]);
}

module.exports = { get, save };