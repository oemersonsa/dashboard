const service = require("../services/mercado-livre.service");
const dashboard = require("../services/mercado-livre-dashboard.service");
const margins = require("../services/mercado-livre-margins.service");
const automatic = require("../services/mercado-livre-auto-sync.service");
const config = require("../config/env");
const logger = require("../utils/logger");
const { readJsonBody } = require("../middleware/body-parser");
const BASE = "/api/integrations/mercado-livre";
function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}
function cookie(value, age) {
  return `ml_oauth=${value}; HttpOnly; SameSite=Lax; Path=${BASE}/callback; Max-Age=${age}${config.ML_REDIRECT_URI.startsWith("https:") ? "; Secure" : ""}`;
}
async function callback(req, res, url) {
  const state = String(req.headers.cookie || "").split(";").map(item => item.trim()).find(item => item.startsWith("ml_oauth="))?.slice(9);
  let outcome = "connected";
  let errorCode = "";
  try { await service.callback(url.searchParams, state); }
  catch (error) {
    outcome = "failed";
    const allowed = new Set(["ml_not_configured", "ml_invalid_oauth_state", "ml_oauth_cookie_missing", "ml_oauth_browser_mismatch", "ml_oauth_expired",
      "ml_authorization_denied", "ml_invalid_client", "ml_invalid_oauth_request", "ml_offline_access_required", "ml_reconnect_required", "ml_invalid_authorization_code",
      "ml_permission_denied", "ml_rate_limited", "ml_unavailable", "ml_invalid_response", "ml_credentials_unavailable", "ml_wrong_account"]);
    errorCode = allowed.has(error.code) ? error.code : "ml_callback_failed";
    const databaseCodes = new Set(["SQLITE_AUTH", "SQLITE_ERROR", "SQLITE_BUSY", "SERVER_ERROR", "AUTH_EXPIRED", "SQL_INPUT_ERROR"]);
    logger.warn("Mercado Livre OAuth callback failed", { code: errorCode, databaseCode: databaseCodes.has(error.code) ? error.code : "" });
  }
  const result = new URLSearchParams({ ml: outcome, ...(errorCode ? { ml_error: errorCode } : {}) });
  res.writeHead(303, { Location: `${config.APP_ORIGIN}/?${result}#/connections`,
    "Set-Cookie": cookie("", 0), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  res.end();
}
async function handle(req, res, user, url) {
  const suffix = url.pathname.slice(BASE.length);
  const sellerId = url.searchParams.get("sellerId") || undefined;
  if (req.method === "GET" && suffix === "/auto-sync") return json(res, 200, { ...await automatic.status(user, sellerId), enabled: false, schedulerConfigured: false, pending: false, running: false });
  if (req.method === "POST" && suffix === "/auto-sync") {
    const input = await readJsonBody(req);
    if (input.enabled) return json(res, 409, { error: "ml_manual_sync_only" });
    return json(res, 200, await automatic.configure(user, input));
  }
  if (req.method === "POST" && suffix === "/auto-sync/run") {
    return json(res, 409, { error: "ml_manual_sync_only" });
  }
  if (req.method === "GET" && suffix === "/margins") return json(res, 200, await margins.list(user, Object.fromEntries(url.searchParams)));
  const marginMatch = suffix.match(/^\/margins\/(\d+)(?:\/(refresh|costs))?$/);
  if (marginMatch) {
    const [, id, action] = marginMatch;
    if (req.method === "GET" && !action) return json(res, 200, await margins.detail(user, id, sellerId));
    if (req.method === "POST" && action === "refresh") return json(res, 200, await margins.refresh(user, id, sellerId));
    if (req.method === "POST" && action === "costs") return json(res, 200, await margins.saveCosts(user, id, await readJsonBody(req)));
  }
  if (req.method === "GET" && suffix === "") return json(res, 200, await service.status(user));
  if (req.method === "POST" && suffix === "/authorize") {
    const result = await service.authorize(user, sellerId);
    res.setHeader("Set-Cookie", cookie(result.state, 600));
    return json(res, 200, { url: result.url });
  }
  if (req.method === "DELETE" && suffix === "") {
    await service.disconnect(user, sellerId);
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && suffix === "/sync") return json(res, 200, await service.sync(user, await readJsonBody(req)));
  if (req.method === "POST" && suffix === "/dashboard/preview") return json(res, 200, await dashboard.preview(user, await readJsonBody(req)));
  if (req.method === "POST" && suffix === "/dashboard/apply") return json(res, 200, await dashboard.apply(user, await readJsonBody(req)));
  if (req.method === "GET" && suffix === "/records") return json(res, 200, await service.list(user, Object.fromEntries(url.searchParams)));
  const match = suffix.match(/^\/claims\/(\d+)\/return$/);
  if (req.method === "GET" && match) return json(res, 200, await service.returnDetails(user, match[1], sellerId));
  return json(res, 404, { error: "not_found" });
}
module.exports = { BASE, callback, handle };
