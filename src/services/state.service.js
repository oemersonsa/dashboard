const { client, withTransaction, queryOne, queryAll } = require("../db");
const platformsRepo = require("../db/repositories/platforms.repo");
const salesRepo = require("../db/repositories/sales.repo");
const returnsRepo = require("../db/repositories/returns.repo");
const settingsRepo = require("../db/repositories/settings.repo");
const goalsRepo = require("../db/repositories/goals.repo");
const { nowIso } = require("../utils/dates");
const { validateBusiness, validateMonth } = require("./business.validation");

async function getBusinessState(userId) {
  const platformRows = await platformsRepo.listByUser(userId);
  const platforms = platformRows.map((row) => ({
    key: row.platform_key,
    name: row.name,
    icon: row.icon,
    color: row.color,
    iconText: row.icon_text,
    archived: Boolean(row.archived)
  }));

  const keyById = new Map(platformRows.map((row) => [row.id, row.platform_key]));
  const dbState = {};

  const salesRows = await salesRepo.listByUser(userId);
  for (const sale of salesRows) {
    const key = keyById.get(sale.platform_id);
    if (!key) continue;
    if (!dbState[sale.month]) dbState[sale.month] = { days: [], returns: {} };
    let day = dbState[sale.month].days.find((item) => item.d === sale.date);
    if (!day) {
      day = { d: sale.date };
      dbState[sale.month].days.push(day);
    }
    day[key] = Number(sale.amount || 0);
    day[`orders_${key}`] = Math.max(0, Math.round(Number(sale.orders_count || 0)));
  }

  const returnsRows = await returnsRepo.listByUser(userId);
  for (const item of returnsRows) {
    const key = keyById.get(item.platform_id);
    if (!key) continue;
    if (!dbState[item.month]) dbState[item.month] = { days: [], returns: {} };
    dbState[item.month].returns[key] = Number(item.amount || 0);
  }

  Object.values(dbState).forEach((monthData) => {
    platforms.forEach((platform) => {
      if (monthData.returns[platform.key] === undefined) monthData.returns[platform.key] = 0;
      monthData.days.forEach((day) => {
        if (day[platform.key] === undefined) day[platform.key] = 0;
        if (day[`orders_${platform.key}`] === undefined) day[`orders_${platform.key}`] = 0;
      });
    });
  });

  // ─── Goals ───
  const goalsRows = await goalsRepo.listByUser(userId);
  const goals = {};
  for (const g of goalsRows) {
    const target = Number(g.target || 0);
    if (target > 0) goals[g.month] = { target };
  }

  const settings = await settingsRepo.get(userId);
  return {
    platforms,
    db: dbState,
    goals,
    currentMonth: settings?.current_month || Object.keys(dbState)[0] || "",
    currentScreen: settings?.current_screen || "hub",
    activeTab: settings?.active_tab || "overview",
    pricing: settings?.pricing_json ? JSON.parse(settings.pricing_json) : null,
    updatedAt: settings?.updated_at || ""
  };
}

async function replaceBusinessState(userId, state, expectedUpdatedAt) {
  validateBusiness(state);
  let savedVersion;
  return withTransaction(async (tx) => {
    const existing = await tx.execute({ sql: "SELECT updated_at FROM app_settings WHERE user_id = ?", args: [userId] });
    const previous = existing.rows[0]?.updated_at || "";
    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== previous) {
      const error = new Error("state_conflict");
      error.code = "state_conflict";
      error.statusCode = 409;
      throw error;
    }
    const timestamp = new Date(Math.max(Date.now(), (Date.parse(previous) || 0) + 1)).toISOString();
    savedVersion = timestamp;
    await tx.execute({ sql: "DELETE FROM sales WHERE user_id = ?", args: [userId] });
    await tx.execute({ sql: "DELETE FROM returns WHERE user_id = ?", args: [userId] });
    await tx.execute({ sql: "DELETE FROM platforms WHERE user_id = ?", args: [userId] });
    await tx.execute({ sql: "DELETE FROM goals WHERE user_id = ?", args: [userId] });

    // Plataformas
    const platformIds = new Map();
    const platforms = state.platforms || [];
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      const res = await tx.execute({
        sql: `INSERT INTO platforms
              (user_id, platform_key, name, icon, color, icon_text, sort_order, archived, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [userId, p.key, p.name, p.icon, p.color,
               p.iconText || "#ffffff", i, p.archived ? 1 : 0, timestamp, timestamp]
      });
      platformIds.set(p.key, Number(res.lastInsertRowid));
    }

    // Vendas
    for (const [month, monthData] of Object.entries(state.db || {})) {
      for (const day of monthData.days || []) {
        for (const platform of platforms) {
          const platformId = platformIds.get(platform.key);
          if (!platformId || !day.d) continue;
          const amount = Number(day[platform.key] || 0);
          const orders = Math.max(0, Math.round(Number(day[`orders_${platform.key}`] || 0)));
          if (amount <= 0 && orders <= 0) continue;
          await tx.execute({
            sql: `INSERT INTO sales
                  (user_id, platform_id, month, date, amount, orders_count, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [userId, platformId, month, day.d, amount, orders, timestamp, timestamp]
          });
        }
      }
    }

    // Devoluções
    for (const [month, monthData] of Object.entries(state.db || {})) {
      for (const platform of platforms) {
        const platformId = platformIds.get(platform.key);
        if (!platformId) continue;
        const amount = Number(monthData.returns?.[platform.key] || 0);
        if (amount <= 0) continue;
        await tx.execute({
          sql: `INSERT INTO returns
                (user_id, platform_id, month, amount, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [userId, platformId, month, amount, timestamp, timestamp]
        });
      }
    }

    // Goals
    for (const [month, value] of Object.entries(state.goals || {})) {
      const target = Number(value?.target ?? value ?? 0);
      if (!Number.isFinite(target) || target <= 0) continue;
      await tx.execute({
        sql: `INSERT INTO goals (user_id, month, target, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [userId, month, target, timestamp, timestamp]
      });
    }

    // Settings
    await tx.execute({
      sql: `INSERT INTO app_settings
            (user_id, current_month, current_screen, active_tab, pricing_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              current_month = excluded.current_month,
              current_screen = excluded.current_screen,
              active_tab = excluded.active_tab,
              pricing_json = excluded.pricing_json,
              updated_at = excluded.updated_at`,
      args: [userId, state.currentMonth || "", state.currentScreen || "hub", state.activeTab || "overview",
             JSON.stringify(state.pricing || null), timestamp]
    });
  }).then(async () => ({ ...await getBusinessState(userId), updatedAt: savedVersion }));
}

function normalizeBusinessPayload(body) {
  const payload = body?.state || body || {};

  // Normaliza goals (aceita { target } ou número direto)
  const rawGoals = payload.goals && typeof payload.goals === "object" ? payload.goals : {};
  const goals = {};
  for (const [month, value] of Object.entries(rawGoals)) {
    const target = Number(value?.target ?? value ?? 0);
    if (Number.isFinite(target) && target > 0) {
      goals[month] = { target };
    }
  }

  return {
    platforms: Array.isArray(payload.platforms) ? payload.platforms : [],
    db: payload.db && typeof payload.db === "object" ? payload.db : {},
    goals,
    currentMonth: String(payload.currentMonth || ""),
    currentScreen: ["dashboard", "calculator", "dailyClose"].includes(payload.currentScreen)
    ? payload.currentScreen : "hub",
    activeTab: String(payload.activeTab || "overview"),
    pricing: payload.pricing && typeof payload.pricing === "object" ? payload.pricing : null
  };
}

//const { client, withTransaction, queryOne, queryAll } = require("../db");
// (ajuste o require existente para incluir `client`)

async function replaceMonth(userId, month, monthData) {
  const ts = nowIso();
  const rows = await queryAll(
    "SELECT platform_key FROM platforms WHERE user_id = ?", [userId]
  );
  const keys = rows.map((r) => r.platform_key);
  validateMonth(month, monthData, new Set(keys));

  const stmts = [
    { sql: "DELETE FROM sales WHERE user_id = ? AND month = ?", args: [userId, month] },
    { sql: "DELETE FROM returns WHERE user_id = ? AND month = ?", args: [userId, month] }
  ];
  stmts.push({ sql: "UPDATE app_settings SET updated_at = ? WHERE user_id = ?", args: [ts, userId] });

  for (const day of monthData.days || []) {
    if (!day?.d) continue;
    for (const key of keys) {
      const amount = Number(day[key] || 0);
      const orders = Math.max(0, Math.round(Number(day[`orders_${key}`] || 0)));
      if (amount <= 0 && orders <= 0) continue;
      stmts.push({
        sql: `INSERT INTO sales
              (user_id, platform_id, month, date, amount, orders_count, created_at, updated_at)
              SELECT ?, id, ?, ?, ?, ?, ?, ? FROM platforms
              WHERE user_id = ? AND platform_key = ?`,
        args: [userId, month, day.d, amount, orders, ts, ts, userId, key]
      });
    }
  }

  for (const key of keys) {
    const amount = Number(monthData.returns?.[key] || 0);
    if (amount <= 0) continue;
    stmts.push({
      sql: `INSERT INTO returns (user_id, platform_id, month, amount, created_at, updated_at)
            SELECT ?, id, ?, ?, ?, ? FROM platforms
            WHERE user_id = ? AND platform_key = ?`,
      args: [userId, month, amount, ts, ts, userId, key]
    });
  }

  await client.batch(stmts, "write");
}

async function deleteMonth(userId, month) {
  await client.batch([
    { sql: "DELETE FROM sales WHERE user_id = ? AND month = ?", args: [userId, month] },
    { sql: "DELETE FROM returns WHERE user_id = ? AND month = ?", args: [userId, month] },
    { sql: "UPDATE app_settings SET updated_at = ? WHERE user_id = ?", args: [nowIso(), userId] }
  ], "write");
}

async function hasPlatforms(userId) {
  const row = await queryOne(
    "SELECT COUNT(*) AS n FROM platforms WHERE user_id = ?", [userId]
  );
  return Number(row?.n || 0) > 0;
}

module.exports = {
  getBusinessState,
  replaceBusinessState,
  normalizeBusinessPayload,
  replaceMonth,
  deleteMonth,
  hasPlatforms
};
