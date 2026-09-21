const { readJsonBody } = require("../middleware/body-parser");
const stateService = require("../services/state.service");

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

async function list(req, res, user) {
  const state = await stateService.getBusinessState(user);
  sendJson(res, 200, { sales: state.db });
}

async function save(req, res, user) {
  const body = await readJsonBody(req);
  const current = await stateService.getBusinessState(user);
  const saved = await stateService.replaceBusinessState(user, {
    ...current,
    db: body?.db && typeof body.db === "object" ? body.db : current.db,
    currentMonth: body?.currentMonth || current.currentMonth
  });
  sendJson(res, 200, { ok: true, sales: saved.db });
}

async function dashboard(req, res, user, month) {
  const state = await stateService.getBusinessState(user);
  const selectedMonth = decodeURIComponent(month || "");
  sendJson(res, 200, {
    month: selectedMonth,
    platforms: state.platforms,
    data: state.db?.[selectedMonth] || { days: [], returns: {} }
  });
}

module.exports = { list, save, dashboard };