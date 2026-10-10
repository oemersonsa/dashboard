const { client, withTransaction, queryOne, queryAll } = require("../db");
const { nowIso } = require("../utils/dates");
const { validateBusiness, validateMonth } = require("./business.validation");

const { readBusinessState: getBusinessState } = require("./state.read.service");

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
    const platformStatements = [
      { sql: "DELETE FROM sales WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM returns WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM platforms WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM goals WHERE user_id = ?", args: [userId] }
    ];

    // Plataformas
    const platformIds = new Map();
    const platforms = state.platforms || [];
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      platformStatements.push({
        sql: `INSERT INTO platforms
              (user_id, platform_key, name, icon, color, icon_text, sort_order, archived, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [userId, p.key, p.name, p.icon, p.color,
               p.iconText || "#ffffff", i, p.archived ? 1 : 0, timestamp, timestamp]
      });
    }
    const platformResults = await tx.batch(platformStatements);
    platforms.forEach((p, i) => platformIds.set(p.key, Number(platformResults[i + 4].lastInsertRowid)));

    // Uma chamada remota por lote, em vez de uma por venda. Todos os lotes
    // permanecem na mesma transação, incluindo a verificação de versão.
    const statements = [
      { sql: "DELETE FROM periods WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM logged_days WHERE user_id = ?", args: [userId] }
    ];

    // Vendas
    for (const [month, monthData] of Object.entries(state.db || {})) {
      statements.push({ sql: "INSERT INTO periods (user_id, month) VALUES (?, ?)", args: [userId, month] });
      for (const day of monthData.days || []) {
        statements.push({ sql: "INSERT INTO logged_days (user_id, month, date) VALUES (?, ?, ?)", args: [userId, month, day.d] });
        for (const platform of platforms) {
          const platformId = platformIds.get(platform.key);
          if (!platformId || !day.d) continue;
          const amount = Number(day[platform.key] || 0);
          const orders = Math.max(0, Math.round(Number(day[`orders_${platform.key}`] || 0)));
          if (amount <= 0 && orders <= 0) continue;
          statements.push({
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
        statements.push({
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
      statements.push({
        sql: `INSERT INTO goals (user_id, month, target, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [userId, month, target, timestamp, timestamp]
      });
    }

    // Settings
    statements.push({
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
    for (let offset = 0; offset < statements.length; offset += 250) {
      await tx.batch(statements.slice(offset, offset + 250));
    }
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
    { sql: "DELETE FROM returns WHERE user_id = ? AND month = ?", args: [userId, month] },
    { sql: "DELETE FROM logged_days WHERE user_id = ? AND month = ?", args: [userId, month] },
    { sql: "INSERT OR IGNORE INTO periods (user_id, month) VALUES (?, ?)", args: [userId, month] }
  ];
  stmts.push({ sql: "UPDATE app_settings SET updated_at = ? WHERE user_id = ?", args: [ts, userId] });

  for (const day of monthData.days || []) {
    if (!day?.d) continue;
    stmts.push({ sql: "INSERT INTO logged_days (user_id, month, date) VALUES (?, ?, ?)", args: [userId, month, day.d] });
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
    { sql: "DELETE FROM logged_days WHERE user_id = ? AND month = ?", args: [userId, month] },
    { sql: "DELETE FROM periods WHERE user_id = ? AND month = ?", args: [userId, month] },
    { sql: "DELETE FROM goals WHERE user_id = ? AND month = ?", args: [userId, month] },
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
