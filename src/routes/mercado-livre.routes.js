const service = require("../services/mercado-livre.service");
const config = require("../config/env");
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
  try { await service.callback(url.searchParams, state); }
  catch { outcome = "failed"; }
  res.writeHead(303, { Location: `${config.APP_ORIGIN}/?ml=${outcome}#/account`,
    "Set-Cookie": cookie("", 0), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  res.end();
}
async function handle(req, res, user, url) {
  const suffix = url.pathname.slice(BASE.length);
  if (req.method === "GET" && suffix === "") return json(res, 200, await service.status(user));
  if (req.method === "POST" && suffix === "/authorize") {
    const result = await service.authorize(user);
    res.setHeader("Set-Cookie", cookie(result.state, 600));
    return json(res, 200, { url: result.url });
  }
  if (req.method === "DELETE" && suffix === "") {
    await service.disconnect(user);
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && suffix === "/sync") return json(res, 200, await service.sync(user, await readJsonBody(req)));
  if (req.method === "GET" && suffix === "/records") return json(res, 200, await service.list(user, Object.fromEntries(url.searchParams)));
  const match = suffix.match(/^\/claims\/(\d+)\/return$/);
  if (req.method === "GET" && match) return json(res, 200, await service.returnDetails(user, match[1]));
  return json(res, 404, { error: "not_found" });
}
module.exports = { BASE, callback, handle };
