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
  const returns = {};
  Object.entries(state.db || {}).forEach(([month, md]) => {
    returns[month] = md.returns || {};
  });
  sendJson(res, 200, { returns });
}

async function save(req, res, user) {
  const body = await readJsonBody(req);
  const current = await stateService.getBusinessState(user);
  const nextDb = { ...(current.db || {}) };
  Object.entries(body?.returns || {}).forEach(([month, values]) => {
    if (!nextDb[month]) nextDb[month] = { days: [], returns: {} };
    nextDb[month].returns = values || {};
  });
  const saved = await stateService.replaceBusinessState(user, { ...current, db: nextDb });
  sendJson(res, 200, { ok: true, state: saved });
}

module.exports = { list, save };