const { readJsonBody } = require("../middleware/body-parser");
const stateService = require("../services/state.service");

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

async function getState(req, res, user) {
  const state = await stateService.getBusinessState(user);
  sendJson(res, 200, { state });
}

async function saveState(req, res, user) {
  const body = await readJsonBody(req);
  const payload = stateService.normalizeBusinessPayload(body);

  // Protege contra um estado vazio (ex.: falha de carregamento) apagar tudo
  if (!payload.platforms.length && await stateService.hasPlatforms(user)) {
    return sendJson(res, 409, { error: "refusing_to_wipe_data" });
  }

  const saved = await stateService.replaceBusinessState(user, payload, body.expectedUpdatedAt);
  sendJson(res, 200, { ok: true, state: saved });
}

module.exports = { getState, saveState };
