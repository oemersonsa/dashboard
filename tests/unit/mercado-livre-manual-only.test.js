import { it, expect } from "vitest";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
const require = createRequire(import.meta.url);
const routes = require("../../src/routes/mercado-livre.routes");
const automatic = require("../../src/services/mercado-livre-auto-sync.service");
const marketplace = require("../../src/services/mercado-livre.service");
function response() {
  return { writeHead(status) { this.status = status; }, end(body) { this.body = JSON.parse(body); } };
}
it("blocks old automatic clients and keeps manual sync available", async () => {
  const original = marketplace.sync;
  let calls = 0;
  marketplace.sync = async () => { calls++; return { count: 1, nextOffset: null }; };
  try {
    for (const path of ["/auto-sync", "/auto-sync/run", "/sync"]) {
      const req = Readable.from([Buffer.from(JSON.stringify({ enabled: true }))]);
      req.method = "POST"; req.headers = { "content-type": "application/json" };
      const res = response();
      await routes.handle(req, res, "user", new URL("http://localhost" + routes.BASE + path));
      expect(res.status).toBe(path === "/sync" ? 200 : 409);
    }
    expect(calls).toBe(1);
  } finally { marketplace.sync = original; }
});
it("does not run legacy enabled accounts from the cron endpoint", async () => {
  const config = require("../../src/config/env"), cron = require("../../src/routes/cron.routes");
  const original = automatic.runDaily, secret = config.CRON_SECRET;
  automatic.runDaily = async () => { throw new Error("Automatic sync must stay disabled"); };
  config.CRON_SECRET = "test-secret-with-at-least-16-chars";
  try {
    const res = response();
    await cron.handle({ headers: { authorization: "Bearer " + config.CRON_SECRET } }, res);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ disabled: true, reason: "ml_manual_sync_only" });
  } finally { automatic.runDaily = original; config.CRON_SECRET = secret; }
});

