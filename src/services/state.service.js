const { db, withTransaction, nowIso } = require("../db");
const platformsRepo = require("../db/repositories/platforms.repo");
const salesRepo = require("../db/repositories/sales.repo");
const returnsRepo = require("../db/repositories/returns.repo");
const settingsRepo = require("../db/repositories/settings.repo");

function getBusinessState(userId) {
  const platformRows = platformsRepo.listByUser(userId);
  const platforms = platformRows.map((row) => ({
    key: row.platform_key,
    name: row.name,
    icon: row.icon,
    color: row.color,
    iconText: row.icon_text
  }));

  const keyById = new Map(platformRows.map((row) => [row.id, row.platform_key]));
  const dbState = {};

  salesRepo.listByUser(userId).forEach((sale) => {
    const key = keyById.get(sale.platform_id);
    if (!key) return;
    if (!dbState[sale.month]) dbState[sale.month] = { days: [], returns: {} };
    let day = dbState[sale.month].days.find((item) => item.d === sale.date);
    if (!day) {
      day = { d: sale.date };
      dbState[sale.month].days.push(day);
    }
    day[key] = Number(sale.amount || 0);
    day[`orders_${key}`] = Math.max(0, Math.round(Number(sale.orders_count || 0)));
  });

  returnsRepo.listByUser(userId).forEach((item) => {
    const key = keyById.get(item.platform_id);
    if (!key) return;
    if (!dbState[item.month]) dbState[item.month] = { days: [], returns: {} };
    dbState[item.month].returns[key] = Number(item.amount || 0);
  });

  Object.values(dbState).forEach((monthData) => {
    platforms.forEach((platform) => {
      if (monthData.returns[platform.key] === undefined) monthData.returns[platform.key] = 0;
      monthData.days.forEach((day) => {
        if (day[platform.key] === undefined) day[platform.key] = 0;
        if (day[`orders_${platform.key}`] === undefined) day[`orders_${platform.key}`] = 0;
      });
    });
  });

  const settings = settingsRepo.get(userId);
  return {
    platforms,
    db: dbState,
    currentMonth: settings?.current_month || Object.keys(dbState)[0] || "",
    currentScreen: settings?.current_screen || "hub",
    pricing: settings?.pricing_json ? JSON.parse(settings.pricing_json) : null,
    updatedAt: settings?.updated_at || ""
  };
}

function replaceBusinessState(userId, state) {
  const timestamp = nowIso();
  withTransaction(() => {
    salesRepo.deleteAllForUser(userId);
    returnsRepo.deleteAllForUser(userId);
    platformsRepo.deleteAllForUser(userId);

    const platformIds = platformsRepo.insertMany(userId, state.platforms || [], timestamp);
    salesRepo.insertMany(userId, state.db || {}, state.platforms || [], platformIds, timestamp);
    returnsRepo.insertMany(userId, state.db || {}, state.platforms || [], platformIds, timestamp);

    settingsRepo.save(userId, {
      currentMonth: state.currentMonth,
      currentScreen: state.currentScreen,
      pricing: state.pricing
    }, timestamp);
  });
  return getBusinessState(userId);
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