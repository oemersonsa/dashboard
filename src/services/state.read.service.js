const { client } = require("../db");
const { validateMonth } = require("./business.validation");
const MONTHS = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const monthDate = key => {
  const [year, name] = key.split("-");
  return new Date(Number(year), MONTHS.indexOf(name === "Março" ? "Marco" : name), 1);
};

async function readBusinessState(userId, options = {}) {
  const tx = await client.transaction("read");
  try {
    const metadata = await tx.batch([
      { sql: "SELECT * FROM app_settings WHERE user_id = ?", args: [userId] },
      { sql: "SELECT * FROM platforms WHERE user_id = ? ORDER BY sort_order, id", args: [userId] },
      { sql: "SELECT month, target FROM goals WHERE user_id = ?", args: [userId] },
      { sql: `SELECT month FROM periods WHERE user_id = ? UNION SELECT month FROM sales WHERE user_id = ?
        UNION SELECT month FROM returns WHERE user_id = ? UNION SELECT month FROM goals WHERE user_id = ?`, args: [userId, userId, userId, userId] }
    ]);
    const settings = metadata[0].rows[0];
    const updatedAt = settings?.updated_at || "";
    if (options.expectedVersion !== undefined && options.expectedVersion !== updatedAt) {
      const error = new Error("state_conflict"); error.code = "state_conflict"; error.statusCode = 409; throw error;
    }
    const platformRows = metadata[1].rows;
    const platforms = platformRows.map(row => ({ key: row.platform_key, name: row.name, icon: row.icon,
      color: row.color, iconText: row.icon_text, archived: Boolean(row.archived) }));
    const periods = metadata[3].rows.map(row => row.month).sort((a, b) => monthDate(a) - monthDate(b));
    const today = new Date();
    const currentMonth = options.month || settings?.current_month || periods.at(-1) || `${today.getFullYear()}-${MONTHS[today.getMonth()]}`;
    let selected = options.periods;
    if (options.initial) {
      validateMonth(currentMonth, { days: [], returns: {} }, new Set());
      const date = monthDate(currentMonth);
      const previous = periods.filter(month => monthDate(month) < date).at(-1);
      selected = [currentMonth, previous];
      for (let offset = 1; offset <= 2; offset++) {
        const earlier = new Date(date.getFullYear(), date.getMonth() - offset, 1);
        selected.push(`${earlier.getFullYear()}-${MONTHS[earlier.getMonth()]}`);
      }
      selected = [...new Set(selected.filter(Boolean))];
    }
    if (selected) {
      if (selected.length > 24) { const error = new Error("invalid_business_data"); error.statusCode = 400; throw error; }
      selected.forEach(month => validateMonth(month, { days: [], returns: {} }, new Set()));
    }
    const clause = selected ? ` AND month IN (${selected.map(() => "?").join(",") || "NULL"})` : "";
    const args = [userId, ...(selected || [])];
    const data = await tx.batch([
      { sql: `SELECT platform_id, month, date, amount, orders_count FROM sales WHERE user_id = ?${clause} ORDER BY month, date, platform_id`, args },
      { sql: `SELECT platform_id, month, amount FROM returns WHERE user_id = ?${clause}`, args },
      { sql: `SELECT month, date FROM logged_days WHERE user_id = ?${clause} ORDER BY month, date`, args }
    ]);
    const keyById = new Map(platformRows.map(row => [String(row.id), row.platform_key]));
    const db = {}; const dayByKey = new Map();
    for (const month of selected ? selected.filter(month => periods.includes(month) || month === currentMonth) : periods) db[month] = { days: [], returns: {} };
    const getDay = (month, date) => {
      db[month] ||= { days: [], returns: {} };
      const key = `${month}:${date}`;
      if (!dayByKey.has(key)) { const day = { d: date }; dayByKey.set(key, day); db[month].days.push(day); }
      return dayByKey.get(key);
    };
    for (const row of data[2].rows) getDay(row.month, row.date);
    for (const row of data[0].rows) {
      const key = keyById.get(String(row.platform_id));
      if (!key) continue;
      const day = getDay(row.month, row.date); day[key] = Number(row.amount || 0); day[`orders_${key}`] = Number(row.orders_count || 0);
    }
    for (const row of data[1].rows) {
      const key = keyById.get(String(row.platform_id));
      if (!key) continue;
      db[row.month] ||= { days: [], returns: {} }; db[row.month].returns[key] = Number(row.amount || 0);
    }
    for (const month of Object.values(db)) {
      month.days.sort((a, b) => Number(a.d.slice(0, 2)) - Number(b.d.slice(0, 2)));
      for (const p of platforms) {
        month.returns[p.key] ??= 0;
        for (const day of month.days) { day[p.key] ??= 0; day[`orders_${p.key}`] ??= 0; }
      }
    }
    const goals = Object.fromEntries(metadata[2].rows.filter(row => Number(row.target) > 0).map(row => [row.month, { target: Number(row.target) }]));
    await tx.commit();
    return { platforms, db, goals, currentMonth, currentScreen: settings?.current_screen || "hub",
      activeTab: settings?.active_tab || "overview", pricing: settings?.pricing_json ? JSON.parse(settings.pricing_json) : null,
      updatedAt, ...(options.initial || selected ? { periods, loadedPeriods: selected || periods } : {}) };
  } catch (error) { try { await tx.rollback(); } catch {} throw error; }
  finally { tx.close(); }
}

module.exports = { readBusinessState };
