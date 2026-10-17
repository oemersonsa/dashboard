import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import { createRequire } from "node:module";
import { resetTestDb, cleanupTestDb } from "../setup/test-db.js";
const require = createRequire(import.meta.url);
const nativeFetch = globalThis.fetch;
let db, config, automatic, marketplace, dashboard, stateService, info, token, otherToken;
let orders, providerStatus, calls, onOrders;
const base = "/api/integrations/mercado-livre";
const request = (path, { method = "GET", body, auth = token } = {}) => nativeFetch(info.url + base + path, {
  method, headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});
const cron = secret => nativeFetch(info.url + "/api/cron/mercado-livre", { headers: secret ? { Authorization: `Bearer ${secret}` } : {} });
const enable = () => automatic.configure("daily-user", { enabled: true, platformKey: "ml" });
async function sales() {
  return db.queryAll("SELECT p.platform_key, s.month, s.date, s.amount, s.orders_count FROM sales s JOIN platforms p ON s.platform_id=p.id ORDER BY p.platform_key, month, date");
}
beforeAll(async () => {
  resetTestDb();
  config = require("../../src/config/env");
  Object.assign(config, { APP_ORIGIN: "https://kanri.example", ML_REDIRECT_URI: "https://kanri.example/api/integrations/mercado-livre/callback",
    ML_CLIENT_ID: "app", ML_CLIENT_SECRET: "private-client-secret", ML_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString("base64") });
  info = await require("../../src/server/index").startServer({ port: 0, host: "127.0.0.1" });
  db = require("../../src/db");
  automatic = require("../../src/services/mercado-livre-auto-sync.service");
  marketplace = require("../../src/services/mercado-livre.service");
  dashboard = require("../../src/services/mercado-livre-dashboard.service");
  stateService = require("../../src/services/state.service");
  for (const username of ["daily-user", "daily-other"]) {
    const response = await nativeFetch(info.url + "/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: "safe-password-123" }) });
    const result = await response.json();
    if (username === "daily-user") token = result.sessionToken;
    else otherToken = result.sessionToken;
  }
});
beforeEach(async () => {
  config.CRON_SECRET = "private-cron-secret-at-least-16";
  for (const table of ["ml_auto_sync", "ml_sync_windows", "ml_records", "ml_connections", "ml_oauth_states"]) await db.execute(`DELETE FROM ${table}`);
  await stateService.replaceBusinessState("daily-user", { platforms: [
    { key: "ml", name: "Mercado Livre", icon: "ML", color: "#ffff00" },
    { key: "other", name: "Outra", icon: "OT", color: "#ffffff" }
  ], db: {}, goals: {} });
  const dates = automatic.dateRange();
  orders = [{ id: 100, seller: { id: 123 }, date_created: `${dates.to}T12:00:00-03:00`, status: "paid", currency_id: "BRL",
    order_items: [{ quantity: 2, unit_price: 12.34, item: { title: "Produto" } }] }];
  calls = []; providerStatus = 200; onOrders = null;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
    const parsed = new URL(url);
    calls.push(parsed.pathname);
    if (parsed.pathname === "/oauth/token") return new Response(JSON.stringify({ access_token: "private-access", refresh_token: "private-refresh", user_id: 123, expires_in: 3600 }));
    if (parsed.pathname === "/users/me") return new Response(JSON.stringify({ id: 123, nickname: "Loja" }));
    expect(parsed.pathname).toBe("/orders/search");
    if (onOrders) await onOrders(parsed);
    if (providerStatus !== 200) return new Response(JSON.stringify({ message: "PRIVATE_PROVIDER_MESSAGE" }), { status: providerStatus });
    const offset = Number(parsed.searchParams.get("offset"));
    return new Response(JSON.stringify({ results: orders.slice(offset, offset + 50), paging: { total: orders.length } }));
  });
  const started = await marketplace.authorize("daily-user");
  await marketplace.callback(new URLSearchParams({ state: started.state, code: "code" }), started.state);
  calls = [];
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await require("../../src/server/index").stopServer(); await cleanupTestDb(); });

describe("daily Mercado Livre sales", () => {
  it("requires a configured scheduler, active destination, authentication and explicit enablement", async () => {
    expect((await request("/auto-sync", { auth: null })).status).toBe(401);
    expect((await request("/auto-sync", { method: "POST", auth: otherToken, body: { enabled: true, platformKey: "ml" } })).status).toBe(409);
    expect((await request("/auto-sync", { method: "POST", body: { enabled: true, platformKey: "missing" } })).status).toBe(400);
    expect((await request("/auto-sync", { method: "POST", body: { enabled: "yes" } })).status).toBe(400);
    config.CRON_SECRET = "";
    expect((await request("/auto-sync", { method: "POST", body: { enabled: true, platformKey: "ml" } })).status).toBe(503);
    expect((await request("/auto-sync")).status).toBe(200);
    expect(await automatic.status("daily-user")).toMatchObject({ enabled: false, schedulerConfigured: false });
    expect(calls).toEqual([]);
  });
  it("secures cron independently of user sessions and never leaks credentials", async () => {
    await enable();
    expect((await cron()).status).toBe(401);
    expect((await cron(token)).status).toBe(401);
    expect((await cron("wrong")).status).toBe(401);
    config.CRON_SECRET = "";
    expect((await cron()).status).toBe(401);
    config.CRON_SECRET = "private-cron-secret-at-least-16";
    const response = await cron(config.CRON_SECRET);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ completed: 1, failed: 0 });
    expect(await (await cron(config.CRON_SECRET)).json()).toMatchObject({ completed: 0, skipped: 1 });
    const status = JSON.stringify(await (await request("/auto-sync")).json());
    for (const secret of [config.CRON_SECRET, config.ML_CLIENT_SECRET, "private-access", "private-refresh"]) expect(status).not.toContain(secret);
  });
  it("fills sales without a browser or preview and reruns without adding duplicates", async () => {
    await enable();
    expect(await automatic.runUser("daily-user")).toMatchObject({ completed: true });
    expect(await sales()).toMatchObject([{ platform_key: "ml", amount: 24.68, orders_count: 1 }]);
    const status = await automatic.status("daily-user");
    expect(status.lastSuccessAt).toBeTruthy();
    expect(status.pending).toBe(false);
    expect(await automatic.runUser("daily-user")).toEqual({ skipped: true });
    expect(await automatic.runUser("daily-user", { force: true })).toMatchObject({ completed: true, changedDays: 0 });
    expect(await sales()).toHaveLength(1);
    orders[0].status = "cancelled";
    await automatic.runUser("daily-user", { force: true });
    expect(await sales()).toEqual([]);
  });
  it("preserves other platforms, returns and dates outside the rolling window", async () => {
    const dates = automatic.dateRange();
    const today = dates.to.slice(8) + "/" + dates.to.slice(5, 7);
    const months = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const month = dates.to.slice(0, 4) + "-" + months[Number(dates.to.slice(5, 7)) - 1];
    const platform = await db.queryOne("SELECT id FROM platforms WHERE platform_key='other' AND user_id='daily-user'");
    await db.execute("INSERT INTO sales (user_id,platform_id,month,date,amount,orders_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
      ["daily-user", platform.id, month, today, 200, 2, "now", "now"]);
    const ml = await db.queryOne("SELECT id FROM platforms WHERE platform_key='ml' AND user_id='daily-user'");
    await db.execute("INSERT INTO sales (user_id,platform_id,month,date,amount,orders_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
      ["daily-user", ml.id, "2020-Janeiro", "01/01", 500, 5, "now", "now"]);
    const before = await db.queryAll("SELECT * FROM returns");
    await enable(); await automatic.runUser("daily-user");
    expect(await sales()).toEqual(expect.arrayContaining([
      expect.objectContaining({ platform_key: "other", amount: 200, orders_count: 2 }),
      expect.objectContaining({ platform_key: "ml", month: "2020-Janeiro", amount: 500 })
    ]));
    expect(await db.queryAll("SELECT * FROM returns")).toEqual(before);
  });
  it("keeps incomplete pages out of the dashboard and resumes after failure", async () => {
    orders = Array.from({ length: 51 }, (_, i) => ({ ...orders[0], id: i + 1 }));
    let failPage = true;
    onOrders = async url => { if (Number(url.searchParams.get("offset")) === 50 && failPage) providerStatus = 429; };
    await enable();
    expect(await automatic.runUser("daily-user")).toMatchObject({ failed: true, error: "ml_rate_limited" });
    expect(await sales()).toEqual([]);
    expect(await automatic.status("daily-user")).toMatchObject({ pending: true, lastError: "ml_rate_limited", lastSuccessAt: null });
    expect((await db.queryOne("SELECT next_offset FROM ml_auto_sync")).next_offset).toBe(50);
    failPage = false; providerStatus = 200;
    expect(await automatic.runUser("daily-user")).toMatchObject({ completed: true });
    expect(await sales()).toMatchObject([{ amount: 1258.68, orders_count: 51 }]);
  });
  it("persists work when the time budget runs out", async () => {
    await enable();
    expect(await automatic.runUser("daily-user", { deadline: Date.now() })).toEqual({ pending: true });
    expect(calls).toEqual([]);
    expect(await sales()).toEqual([]);
    expect(await automatic.status("daily-user")).toMatchObject({ pending: true, running: false });
    expect(await automatic.runUser("daily-user")).toMatchObject({ completed: true });
  });
  it("prevents overlapping workers and stops dashboard writes after pausing", async () => {
    await enable();
    let paused = false;
    onOrders = async () => {
      expect(await automatic.runUser("daily-user")).toEqual({ skipped: true });
      await automatic.configure("daily-user", { enabled: false }); paused = true;
    };
    expect(await automatic.runUser("daily-user")).toMatchObject({ failed: true, error: "ml_auto_sync_changed" });
    expect(paused).toBe(true);
    expect(await sales()).toEqual([]);
    expect(await automatic.status("daily-user")).toMatchObject({ enabled: false, pending: false, running: false });
  });
  it("invalidates stale previews and rejects a changed seller or archived platform", async () => {
    await enable();
    const dates = automatic.dateRange();
    await marketplace.sync("daily-user", { ...dates, offset: 0 });
    const preview = await dashboard.preview("daily-user", { ...dates, platformKey: "ml" });
    await automatic.runUser("daily-user");
    await expect(dashboard.apply("daily-user", { ...dates, platformKey: "ml", fingerprint: preview.fingerprint })).rejects.toMatchObject({ code: "ml_preview_expired" });
    await db.execute("UPDATE platforms SET archived=1 WHERE user_id='daily-user' AND platform_key='ml'");
    expect(await automatic.runUser("daily-user", { force: true })).toMatchObject({ failed: true, error: "ml_platform_required" });
    await db.execute("UPDATE ml_connections SET seller_id='456'");
    expect(await automatic.runUser("daily-user")).toEqual({ skipped: true });
    expect(await automatic.status("daily-user")).toMatchObject({ enabled: false });
  });
  it("restarts after a manual sync replaces the pending window", async () => {
    await enable();
    orders = Array.from({ length: 51 }, (_, i) => ({ ...orders[0], id: i + 1 }));
    onOrders = async url => { if (Number(url.searchParams.get("offset")) === 50) providerStatus = 429; };
    await automatic.runUser("daily-user");
    onOrders = null; providerStatus = 200;
    await marketplace.sync("daily-user", { ...automatic.dateRange(), offset: 0 });
    // Even a manual first page has a different run but the same next offset. If
    // it disappears entirely, the automatic cursor must restart, never apply.
    await db.execute("DELETE FROM ml_sync_windows");
    expect(await automatic.runUser("daily-user")).toMatchObject({ failed: true, error: "ml_sync_restart_required" });
    expect((await db.queryOne("SELECT next_offset FROM ml_auto_sync")).next_offset).toBe(0);
    expect(await automatic.runUser("daily-user")).toMatchObject({ completed: true });
  });
  it("disconnects automatic settings while preserving imported sales", async () => {
    await enable(); await automatic.runUser("daily-user");
    const before = await sales();
    await marketplace.disconnect("daily-user");
    expect(await db.queryOne("SELECT * FROM ml_auto_sync")).toBeNull();
    expect(await sales()).toEqual(before);
    expect(await automatic.runDaily()).toMatchObject({ completed: 0, failed: 0 });
  });
  it("uses Brasilia dates across midnight and month boundaries", () => {
    expect(automatic.dateRange(new Date("2026-03-01T01:00:00Z"))).toEqual({ from: "2026-01-29", to: "2026-02-28", kind: "orders" });
    expect(automatic.dateRange(new Date("2026-01-01T04:00:00Z"))).toEqual({ from: "2025-12-02", to: "2026-01-01", kind: "orders" });
  });
});
