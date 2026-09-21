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
  sendJson(res, 200, { platforms: state.platforms });
}

async function save(req, res, user) {
  const body = await readJsonBody(req);
  const current = await stateService.getBusinessState(user);
  const saved = await stateService.replaceBusinessState(user, {
    ...current,
    platforms: Array.isArray(body?.platforms) ? body.platforms : []
  });
  sendJson(res, 200, { ok: true, platforms: saved.platforms });
}

module.exports = { list, save };