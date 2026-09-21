const { readJsonBody } = require("../middleware/body-parser");
const stateService = require("../services/state.service");

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

async function getState(req, res, user) {
  sendJson(res, 200, { state: stateService.getBusinessState(user) });
}

async function saveState(req, res, user) {
  const body = await readJsonBody(req);
  const saved = stateService.replaceBusinessState(user, stateService.normalizeBusinessPayload(body));
  sendJson(res, 200, { ok: true, state: saved });
}

module.exports = { getState, saveState };