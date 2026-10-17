const crypto = require("crypto");
const config = require("../config/env");
const automatic = require("../services/mercado-livre-auto-sync.service");
async function handle(req, res) {
  const expected = Buffer.from(`Bearer ${config.CRON_SECRET}`);
  const actual = Buffer.from(String(req.headers.authorization || ""));
  const authorized = config.CRON_SECRET.length >= 16 && expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  const result = authorized ? await automatic.runDaily() : { error: "unauthorized" };
  res.writeHead(authorized ? 200 : 401, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(result));
}
module.exports = { handle };
