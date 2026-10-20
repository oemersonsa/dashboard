import { beforeAll, beforeEach, afterAll, afterEach, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
import { resetTestDb, cleanupTestDb } from "../setup/test-db.js";
const require = createRequire(import.meta.url), nativeFetch = globalThis.fetch;
let db, ml, automatic, dashboard, info, token, seller, calls, failingSeller;
const base = "/api/integrations/mercado-livre";
const request = (path, method = "GET", body) => nativeFetch(info.url + base + path, {
  method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {})
});
async function connect(id, reconnectId) {
  seller = id;
  const start = await ml.authorize("multi-user", reconnectId);
  await ml.callback(new URLSearchParams({ state: start.state, code: "test" }), start.state);
}
beforeAll(async () => {
  resetTestDb();
  Object.assign(require("../../src/config/env"), { APP_ORIGIN: "https://kanri.example", ML_CLIENT_ID: "app", ML_CLIENT_SECRET: "secret",
    ML_REDIRECT_URI: "https://kanri.example/api/integrations/mercado-livre/callback", ML_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString("base64"), CRON_SECRET: "test-cron-secret-123456" });
  info = await require("../../src/server/index").startServer({ port: 0, host: "127.0.0.1" });
  db = require("../../src/db"); ml = require("../../src/services/mercado-livre.service");
  automatic = require("../../src/services/mercado-livre-auto-sync.service"); dashboard = require("../../src/services/mercado-livre-dashboard.service");
  const registration = await nativeFetch(info.url + "/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "multi-user", password: "safe-password-1234" }) });
  token = (await registration.json()).sessionToken;
  await db.execute("INSERT INTO users (username,password_hash,created_at,updated_at) SELECT 'multi-other', password_hash,created_at,updated_at FROM users WHERE username='multi-user'");
});
beforeEach(async () => {
  for (const table of ["ml_auto_sync", "ml_connections", "ml_oauth_states", "ml_sync_windows", "ml_records", "ml_financials", "ml_order_costs"]) await db.execute(`DELETE FROM ${table}`);
  await require("../../src/services/state.service").replaceBusinessState("multi-user", { platforms: [
    { key: "main", name: "Loja principal", icon: "ML", color: "#ffe600" }, { key: "second", name: "Loja secundária", icon: "ML", color: "#ffe600" }
  ], db: {}, goals: {} });
  calls = []; failingSeller = "";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
    const parsed = new URL(url); calls.push({ parsed, options });
    if (parsed.pathname === "/oauth/token") {
      const params = new URLSearchParams(options.body);
      const id = params.get("grant_type") === "refresh_token" ? params.get("refresh_token").split("-")[1] : seller;
      return Response.json({ access_token: `access-${id}`, refresh_token: `refresh-${id}`, user_id: id, expires_in: 3600 });
    }
    const id = options.headers.Authorization.split("-").at(-1);
    if (parsed.pathname === "/users/me") return Response.json({ id, nickname: `Loja ${id}` });
    expect(parsed.pathname).toBe("/orders/search");
    expect(parsed.searchParams.get("seller")).toBe(id);
    if (id === failingSeller) return Response.json({}, { status: 429 });
    return Response.json({ results: [{ id: id + "01", seller: { id }, status: "paid", currency_id: "BRL",
      date_created: automatic.dateRange().to + "T12:00:00-03:00", order_items: [{ quantity: 1, unit_price: id === "123" ? 10 : 20, item: { title: "Produto" } }] }], paging: { total: 1 } });
  });
  await connect("123"); await connect("456");
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await require("../../src/server/index").stopServer(); await cleanupTestDb(); });

it("adds and reconnects accounts without replacing another seller, and rejects reconnecting the wrong store", async () => {
  expect((await (await request("")).json()).accounts).toEqual([{ sellerId: "123", nickname: "Loja 123" }, { sellerId: "456", nickname: "Loja 456" }]);
  await connect("123", "123");
  expect((await ml.status("multi-user")).accounts).toHaveLength(2);
  await expect(connect("456", "123")).rejects.toMatchObject({ code: "ml_wrong_account" });
  expect((await ml.status("multi-user")).accounts).toHaveLength(2);
  const publicStatus = JSON.stringify(await ml.status("multi-user"));
  expect(publicStatus).not.toContain("access-"); expect(publicStatus).not.toContain("refresh-");
});

it("requires a selected seller and isolates records, authorization and refresh tokens by user and account", async () => {
  const dates = automatic.dateRange();
  expect((await request("/sync", "POST", dates)).status).toBe(400);
  expect((await request("", "DELETE")).status).toBe(400);
  expect((await request("/auto-sync")).status).toBe(400);
  await expect(ml.connection("multi-other", "123")).rejects.toMatchObject({ code: "ml_not_connected" });
  await expect(ml.authorize("multi-user", "999")).rejects.toMatchObject({ code: "ml_not_connected" });
  await ml.sync("multi-user", { ...dates, sellerId: "123" });
  await ml.sync("multi-user", { ...dates, sellerId: "456" });
  expect((await ml.list("multi-user", { ...dates, sellerId: "123" })).records.map(row => row.id)).toEqual(["12301"]);
  expect((await ml.list("multi-user", { ...dates, sellerId: "456" })).records.map(row => row.id)).toEqual(["45601"]);
  const other = await db.queryOne("SELECT generation FROM ml_connections WHERE seller_id='456'");
  await db.execute("UPDATE ml_connections SET expires_at=0 WHERE seller_id='123'");
  expect((await ml.connection("multi-user", "123")).accessToken).toBe("access-123");
  expect(await db.queryOne("SELECT generation FROM ml_connections WHERE seller_id='456'")).toEqual(other);
  const margins = require("../../src/services/mercado-livre-margins.service");
  expect((await margins.list("multi-user", { ...dates, sellerId: "456" })).records[0].order.id).toBe("45601");
  await expect(margins.detail("multi-user", "45601", "123")).rejects.toMatchObject({ code: "ml_resource_not_found" });
});

it("synchronizes both stores independently, protects destinations, and disconnects only the selected store", async () => {
  await automatic.configure("multi-user", { sellerId: "123", platformKey: "main", enabled: true });
  await expect(automatic.configure("multi-user", { sellerId: "456", platformKey: "main", enabled: true })).rejects.toMatchObject({ code: "ml_platform_in_use" });
  await automatic.configure("multi-user", { sellerId: "456", platformKey: "second", enabled: true });
  expect(await automatic.runDaily()).toMatchObject({ completed: 2, failed: 0 });
  const sales = await db.queryAll("SELECT p.platform_key,s.amount FROM sales s JOIN platforms p ON p.id=s.platform_id ORDER BY p.platform_key");
  expect(sales).toEqual([{ platform_key: "main", amount: 10 }, { platform_key: "second", amount: 20 }]);
  await expect(dashboard.preview("multi-user", { ...automatic.dateRange(), sellerId: "456", platformKey: "main" })).rejects.toMatchObject({ code: "ml_platform_in_use" });
  await automatic.configure("multi-user", { sellerId: "123", enabled: false });
  expect(await automatic.status("multi-user", "456")).toMatchObject({ enabled: true, platformKey: "second" });
  await ml.disconnect("multi-user", "123");
  expect((await ml.status("multi-user")).accounts).toEqual([{ sellerId: "456", nickname: "Loja 456" }]);
  expect((await ml.list("multi-user", { ...automatic.dateRange(), sellerId: "456" })).records).toHaveLength(1);
  expect((await db.queryAll("SELECT * FROM sales"))).toHaveLength(2);
  expect(await automatic.status("multi-user", "456")).toMatchObject({ enabled: true, lastError: null });
});

it("continues the other account when one provider call fails", async () => {
  for (const [sellerId, platformKey] of [["123", "main"], ["456", "second"]]) await automatic.configure("multi-user", { sellerId, platformKey, enabled: true });
  failingSeller = "123";
  expect(await automatic.runDaily()).toMatchObject({ completed: 1, failed: 1 });
  expect(await automatic.status("multi-user", "123")).toMatchObject({ lastError: "ml_rate_limited" });
  expect(await automatic.status("multi-user", "456")).toMatchObject({ lastError: null });
});
