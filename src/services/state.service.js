const { withTransaction, queryOne, queryAll } = require("../db");
const platformsRepo = require("../db/repositories/platforms.repo");
const salesRepo = require("../db/repositories/sales.repo");
const returnsRepo = require("../db/repositories/returns.repo");
const settingsRepo = require("../db/repositories/settings.repo");
const { nowIso } = require("../utils/dates");

async function getBusinessState(userId) {
  const platformRows = await platformsRepo.listByUser(userId);
  const platforms = platformRows.map((row) => ({
    key: row.platform_key,
    name: row.name,
    icon: row.icon,
    color: row.color,
    iconText: row.icon_text
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

  const settings = await settingsRepo.get(userId);
  return {
    platforms,
    db: dbState,
    currentMonth: settings?.current_month || Object.keys(dbState)[0] || "",
    currentScreen: settings?.current_screen || "hub",
    pricing: settings?.pricing_json ? JSON.parse(settings.pricing_json) : null,
    updatedAt: settings?.updated_at || ""
  };
}

async function replaceBusinessState(userId, state) {
  const timestamp = nowIso();
  return withTransaction(async (tx) => {
    // Deletar tudo do usuário
    await tx.execute({ sql: "DELETE FROM sales WHERE user_id = ?", args: [userId] });
    await tx.execute({ sql: "DELETE FROM returns WHERE user_id = ?", args: [userId] });
    await tx.execute({ sql: "DELETE FROM platforms WHERE user_id = ?", args: [userId] });

    // Inserir plataformas
    const platformIds = new Map();
    const platforms = state.platforms || [];
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      const res = await tx.execute({
        sql: `INSERT INTO platforms
              (user_id, platform_key, name, icon, color, icon_text, sort_order, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [userId, p.key, p.name, p.icon, p.color,
               p.iconText || "#ffffff", i, timestamp, timestamp]
      });
      platformIds.set(p.key, Number(res.lastInsertRowid));
    }

    // Inserir vendas
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

    // Inserir devoluções
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

    // Settings
    await tx.execute({
      sql: `INSERT INTO app_settings
            (user_id, current_month, current_screen, pricing_json, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              current_month = excluded.current_month,
              current_screen = excluded.current_screen,
              pricing_json = excluded.pricing_json,
              updated_at = excluded.updated_at`,
      args: [userId, state.currentMonth || "", state.currentScreen || "hub",
             JSON.stringify(state.pricing || null), timestamp]
    });
  }).then(() => getBusinessState(userId));
}

function normalizeBusinessPayload(body) {
  const payload = body?.state || body || {};
  return {
    platforms: Array.isArray(payload.platforms) ? payload.platforms : [],
    db: payload.db && typeof payload.db === "object" ? payload.db : {},
    currentMonth: String(payload.currentMonth || ""),
    currentScreen: payload.currentScreen === "dashboard" || payload.currentScreen === "calculator"
      ? payload.currentScreen : "hub",
    pricing: payload.pricing && typeof payload.pricing === "object" ? payload.pricing : null
  };
}

module.exports = { getBusinessState, replaceBusinessState, normalizeBusinessPayload };