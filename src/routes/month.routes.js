const { readJsonBody } = require("../middleware/body-parser");
const stateService = require("../services/state.service");
const settingsRepo = require("../db/repositories/settings.repo");
const { nowIso } = require("../utils/dates");

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function validMonth(m) {
  return typeof m === "string" && m.length > 0 && m.length <= 40;
}

async function saveMonth(req, res, user, rawMonth) {
  const month = decodeURIComponent(rawMonth || "");
  if (!validMonth(month)) return sendJson(res, 400, { error: "invalid_month" });
  const body = await readJsonBody(req);
  await stateService.replaceMonth(user, month, {
    days: Array.isArray(body?.days) ? body.days : [],
    returns: body?.returns && typeof body.returns === "object" ? body.returns : {}
  });
  sendJson(res, 200, { ok: true });
}

async function removeMonth(req, res, user, rawMonth) {
  const month = decodeURIComponent(rawMonth || "");
  if (!validMonth(month)) return sendJson(res, 400, { error: "invalid_month" });
  await stateService.deleteMonth(user, month);
  sendJson(res, 200, { ok: true });
}

async function saveSettings(req, res, user) {
  const body = await readJsonBody(req);
  await settingsRepo.save(user, {
    currentMonth: String(body?.currentMonth || ""),
    currentScreen: ["dashboard", "calculator", "dailyClose"].includes(body?.currentScreen)
      ? body.currentScreen : "hub",
    pricing: body?.pricing && typeof body.pricing === "object" ? body.pricing : null
  }, nowIso());
  sendJson(res, 200, { ok: true });
}

module.exports = { saveMonth, removeMonth, saveSettings };