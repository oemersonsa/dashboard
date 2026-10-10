const { withTransaction } = require("../db");
const { validateBusiness, validateMonth } = require("./business.validation");
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value && typeof value === "object" && !Array.isArray(value);
function fail(code = "invalid_business_data", statusCode = 400) {
  const error = new Error(code); error.code = code; error.statusCode = statusCode; throw error;
}

async function patchBusinessState(userId, changes, expectedUpdatedAt) {
  if (!object(changes) || typeof expectedUpdatedAt !== "string" ||
      Object.keys(changes).some(key => !["platforms", "pricing", "goals", "months"].includes(key))) fail();
  return withTransaction(async tx => {
    const existing = await tx.execute({ sql: "SELECT * FROM app_settings WHERE user_id = ?", args: [userId] });
    const settings = existing.rows[0];
    const previous = settings?.updated_at || "";
    if (previous !== expectedUpdatedAt) fail("state_conflict", 409);
    const timestamp = new Date(Math.max(Date.now(), (Date.parse(previous) || 0) + 1)).toISOString();
    const platformRows = (await tx.execute({ sql: "SELECT * FROM platforms WHERE user_id = ? ORDER BY sort_order", args: [userId] })).rows;
    const platforms = own(changes, "platforms") ? changes.platforms : platformRows.map(row => ({ key: row.platform_key, name: row.name }));
    validateBusiness({ platforms, db: {} });
    if (!platforms.length && platformRows.length) fail("refusing_to_wipe_data", 409);
    if (own(changes, "pricing") && changes.pricing !== null && !object(changes.pricing)) fail();
    if (own(changes, "goals") && !object(changes.goals)) fail();
    if (own(changes, "months") && !object(changes.months)) fail();
    const keys = new Set(platforms.map(p => p.key));
    const months = changes.months || {};
    for (const [month, data] of Object.entries(months)) {
      if (data === null) { validateMonth(month, { days: [], returns: {} }, keys); continue; }
      if (!object(data) || !Array.isArray(data.days) || !Array.isArray(data.deletedDays) || !object(data.returns) ||
          Object.keys(data).some(key => !["days", "deletedDays", "returns"].includes(key))) fail();
      validateMonth(month, { days: data.days, returns: data.returns }, keys);
      validateMonth(month, { days: data.deletedDays.map(d => ({ d })), returns: {} }, keys);
      if (data.days.some(day => data.deletedDays.includes(day.d))) fail();
    }
    for (const [month, goal] of Object.entries(changes.goals || {})) {
      validateBusiness({ platforms, db: {}, goals: { [month]: goal === null ? 0 : goal } });
    }
    const affected = Object.entries(months).flatMap(([month, data]) => (data?.days || []).map(day => ({ month, day })));
    const existingDays = new Map();
    for (let offset = 0; offset < affected.length; offset += 250) {
      const slice = affected.slice(offset, offset + 250);
      const rows = await tx.batch(slice.map(({ month, day }) => ({ sql: `SELECT p.platform_key, s.amount, s.orders_count
        FROM sales s JOIN platforms p ON p.id = s.platform_id WHERE s.user_id = ? AND s.month = ? AND s.date = ?`, args: [userId, month, day.d] })));
      rows.forEach((result, index) => existingDays.set(`${slice[index].month}:${slice[index].day.d}`,
        new Map(result.rows.map(row => [row.platform_key, row]))));
    }
    const statements = [];
    if (own(changes, "platforms")) {
      for (let index = 0; index < platforms.length; index++) {
        const p = platforms[index];
        statements.push({ sql: `INSERT INTO platforms
          (user_id, platform_key, name, icon, color, icon_text, sort_order, archived, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, platform_key) DO UPDATE SET name=excluded.name, icon=excluded.icon,
          color=excluded.color, icon_text=excluded.icon_text, sort_order=excluded.sort_order,
          archived=excluded.archived, updated_at=excluded.updated_at`,
          args: [userId, p.key, p.name, String(p.icon || p.name.slice(0, 2)), String(p.color || "#2563eb"), String(p.iconText || "#ffffff"), index, p.archived ? 1 : 0, timestamp, timestamp] });
      }
      const removed = platformRows.filter(row => !keys.has(row.platform_key));
      for (const row of removed) {
        statements.push({ sql: "DELETE FROM sales WHERE user_id = ? AND platform_id = ?", args: [userId, row.id] });
        statements.push({ sql: "DELETE FROM returns WHERE user_id = ? AND platform_id = ?", args: [userId, row.id] });
        statements.push({ sql: "DELETE FROM platforms WHERE user_id = ? AND id = ?", args: [userId, row.id] });
      }
    }
    for (const [month, data] of Object.entries(months)) {
      if (data === null) {
        for (const table of ["sales", "returns", "logged_days", "periods", "goals"]) statements.push({ sql: `DELETE FROM ${table} WHERE user_id = ? AND month = ?`, args: [userId, month] });
        continue;
      }
      statements.push({ sql: "INSERT OR IGNORE INTO periods (user_id, month) VALUES (?, ?)", args: [userId, month] });
      for (const date of data.deletedDays) {
        statements.push({ sql: "DELETE FROM sales WHERE user_id = ? AND month = ? AND date = ?", args: [userId, month, date] });
        statements.push({ sql: "DELETE FROM logged_days WHERE user_id = ? AND month = ? AND date = ?", args: [userId, month, date] });
      }
      for (const day of data.days) {
        statements.push({ sql: "INSERT OR IGNORE INTO logged_days (user_id, month, date) VALUES (?, ?, ?)", args: [userId, month, day.d] });
        for (const key of keys) {
          const amount = Number(day[key] || 0); const orders = Number(day[`orders_${key}`] || 0);
          const previous = existingDays.get(`${month}:${day.d}`)?.get(key);
          if (amount === Number(previous?.amount || 0) && orders === Number(previous?.orders_count || 0)) continue;
          if (!amount && !orders) {
            statements.push({ sql: `DELETE FROM sales WHERE user_id = ? AND month = ? AND date = ?
              AND platform_id IN (SELECT id FROM platforms WHERE user_id = ? AND platform_key = ?)`, args: [userId, month, day.d, userId, key] });
            continue;
          }
          statements.push({ sql: `INSERT INTO sales (user_id, platform_id, month, date, amount, orders_count, created_at, updated_at)
            SELECT ?, id, ?, ?, ?, ?, ?, ? FROM platforms WHERE user_id = ? AND platform_key = ?
            ON CONFLICT(user_id, platform_id, month, date) DO UPDATE SET amount=excluded.amount, orders_count=excluded.orders_count, updated_at=excluded.updated_at`,
            args: [userId, month, day.d, amount, orders, timestamp, timestamp, userId, key] });
        }
      }
      for (const [key, amount] of Object.entries(data.returns)) {
        statements.push({ sql: `INSERT INTO returns (user_id, platform_id, month, amount, created_at, updated_at)
          SELECT ?, id, ?, ?, ?, ? FROM platforms WHERE user_id = ? AND platform_key = ?
          ON CONFLICT(user_id, platform_id, month) DO UPDATE SET amount=excluded.amount, updated_at=excluded.updated_at`,
          args: [userId, month, amount, timestamp, timestamp, userId, key] });
      }
    }
    for (const [month, goal] of Object.entries(changes.goals || {})) {
      if (months[month] === null || goal === null) statements.push({ sql: "DELETE FROM goals WHERE user_id = ? AND month = ?", args: [userId, month] });
      else statements.push({ sql: `INSERT INTO goals (user_id, month, target, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, month) DO UPDATE SET target=excluded.target, updated_at=excluded.updated_at`,
        args: [userId, month, Number(goal?.target ?? goal), timestamp, timestamp] });
    }
    statements.push({ sql: `INSERT INTO app_settings (user_id, current_month, current_screen, active_tab, pricing_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET pricing_json=excluded.pricing_json, updated_at=excluded.updated_at`,
      args: [userId, settings?.current_month || "", settings?.current_screen || "hub", settings?.active_tab || "overview",
        own(changes, "pricing") ? JSON.stringify(changes.pricing) : settings?.pricing_json || "null", timestamp] });
    for (let offset = 0; offset < statements.length; offset += 250) await tx.batch(statements.slice(offset, offset + 250));
    return { updatedAt: timestamp };
  });
}

module.exports = { patchBusinessState };
