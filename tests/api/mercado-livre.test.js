import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { createRequire } from "node:module";
import { resetTestDb, cleanupTestDb } from "../setup/test-db.js";
const require = createRequire(import.meta.url);
const nativeFetch = globalThis.fetch;
let info, token, otherToken, config, db;
const base = "/api/integrations/mercado-livre";
let providerCalls = [];
let orders = [];
let claims = [];
let tokenLifetime = 3600;
let providerStatus = 200;
let orderTotal;
let oauthError = "";
let noRefreshToken = false;

async function request(path = "", { method = "GET", body, auth = token, headers = {}, ...options } = {}) {
  return nativeFetch(info.url + base + path, { method, redirect: "manual", ...options,
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}) });
}
function mockProvider() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://api.mercadolibre.com");
    providerCalls.push({ url: parsed, options });
    if (parsed.pathname === "/oauth/token" && oauthError) return new Response(JSON.stringify({ error: oauthError, message: "SENSITIVE_PROVIDER_MESSAGE" }), { status: 400 });
    if (providerStatus !== 200) return new Response(JSON.stringify({ error: "SENSITIVE_PROVIDER_MESSAGE" }), { status: providerStatus });
    let data;
    if (parsed.pathname === "/oauth/token") data = { access_token: "secret-access", ...(noRefreshToken ? {} : { refresh_token: "secret-refresh" }), user_id: 123, expires_in: tokenLifetime };
    else if (parsed.pathname === "/users/me") data = { id: 123, nickname: "Loja teste" };
    else if (parsed.pathname === "/orders/search") data = { results: orders, paging: { total: orderTotal ?? orders.length } };
    else if (parsed.pathname === "/post-purchase/v1/claims/search") data = { data: claims, paging: { total: claims.length } };
    else if (parsed.pathname === "/post-purchase/v2/claims/456/returns") data = { id: 789, status: "pending", shipments: [{ shipment_id: 987, status: "shipped", tracking_number: "ABC", destination: { shipping_address: { address_line: "PRIVATE" } } }] };
    else throw new Error(`Unexpected provider path: ${parsed.pathname}`);
    return new Response(JSON.stringify(data), { status: 200 });
  });
}
async function connect() {
  const start = await request("/authorize", { method: "POST" });
  const result = await start.json();
  const url = new URL(result.url);
  const cookie = start.headers.get("set-cookie").split(";")[0];
  const response = await request(`/callback?state=${url.searchParams.get("state")}&code=test-code`, { auth: null, headers: { Cookie: cookie } });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toContain("ml=connected");
  return { url, cookie };
}
const dates = { from: "2026-10-01", to: "2026-10-17", kind: "orders" };
const order = { id: 111, seller: { id: 123 }, pack_id: 999, date_created: "2026-10-03T12:00:00.000-03:00", status: "paid", currency_id: "BRL",
  order_items: [{ quantity: 2, unit_price: 12.34, item: { title: "Produto <script>", seller_sku: "SKU" } }],
  payments: [{ transaction_amount_refunded: 5 }], buyer: { first_name: "PRIVATE" } };

beforeAll(async () => {
  resetTestDb();
  config = require("../../src/config/env");
  Object.assign(config, { ML_CLIENT_ID: "app-id", ML_CLIENT_SECRET: "client-secret", ML_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    APP_ORIGIN: "https://kanri.example", ML_REDIRECT_URI: "https://kanri.example/api/integrations/mercado-livre/callback" });
  info = await require("../../src/server/index").startServer({ port: 0, host: "127.0.0.1" });
  db = require("../../src/db");
  for (const user of ["ml-user", "ml-other"]) {
    const response = await nativeFetch(`${info.url}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: "safe-password-123" }) });
    const result = await response.json();
    if (user === "ml-user") token = result.sessionToken;
    else otherToken = result.sessionToken;
  }
});
afterEach(() => { vi.restoreAllMocks(); providerCalls = []; providerStatus = 200; tokenLifetime = 3600; orderTotal = undefined; oauthError = ""; noRefreshToken = false; });
afterAll(async () => { await require("../../src/server/index").stopServer(); await cleanupTestDb(); });

describe("Mercado Livre integration", () => {
  it("requires local authentication and reports missing configuration safely", async () => {
    expect((await request("", { auth: null })).status).toBe(401);
    const secret = config.ML_CLIENT_SECRET;
    config.ML_CLIENT_SECRET = "";
    expect(await (await request()).json()).toMatchObject({ configured: false, connected: false });
    expect((await request("/authorize", { method: "POST" })).status).toBe(503);
    config.ML_CLIENT_SECRET = secret;
  });
  it("reports configuration problems without returning credentials", async () => {
    const previous = config.ML_REDIRECT_URI;
    try {
      config.ML_REDIRECT_URI = "https://other.example/api/integrations/mercado-livre/callback";
      const result = await (await request()).json();
      expect(result.configured).toBe(false);
      expect(result.configuration).toEqual({ issues: ["origin_mismatch"], appOrigin: "https://kanri.example", redirectOrigin: "https://other.example" });
      expect(JSON.stringify(result)).not.toContain(config.ML_CLIENT_SECRET);
      expect(JSON.stringify(result)).not.toContain(config.ML_TOKEN_ENCRYPTION_KEY);
      config.ML_REDIRECT_URI = "https://other.example/wrong-callback";
      expect((await (await request()).json()).configuration.issues).toContain("invalid_redirect_uri");
    } finally { config.ML_REDIRECT_URI = previous; }
  });
  it("uses PKCE, a browser cookie, one-time state and encrypted credentials", async () => {
    mockProvider();
    const { url, cookie } = await connect();
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const grant = new URLSearchParams(providerCalls[0].options.body);
    const crypto = require("node:crypto");
    expect(crypto.createHash("sha256").update(grant.get("code_verifier")).digest("base64url")).toBe(url.searchParams.get("code_challenge"));
    const row = await db.queryOne("SELECT tokens FROM ml_connections WHERE user_id = ?", ["ml-user"]);
    expect(row.tokens).not.toContain("secret-access");
    expect(await (await request()).json()).toMatchObject({ configured: true, connected: true, sellerId: "123", nickname: "Loja teste",
      configuration: { issues: [], appOrigin: "https://kanri.example", redirectOrigin: "https://kanri.example" } });
    const replay = await request(`/callback?state=${url.searchParams.get("state")}&code=again`, { auth: null, headers: { Cookie: cookie } });
    expect(replay.headers.get("location")).toContain("ml=failed");
    expect(providerCalls).toHaveLength(2);
  });
  it("rejects missing browser binding and expired or denied authorization", async () => {
    mockProvider();
    const start = await request("/authorize", { method: "POST" });
    const url = new URL((await start.json()).url);
    const path = `/callback?state=${url.searchParams.get("state")}&code=code`;
    expect((await request(path, { auth: null })).headers.get("location")).toContain("ml_error=ml_oauth_cookie_missing");
    await db.execute("UPDATE ml_oauth_states SET expires_at = 0");
    expect((await request(path, { auth: null, headers: { Cookie: start.headers.get("set-cookie").split(";")[0] } })).headers.get("location")).toContain("ml_error=ml_oauth_expired");
    expect(providerCalls).toHaveLength(0);
    const denied = await request("/authorize", { method: "POST" });
    const deniedUrl = new URL((await denied.json()).url);
    expect((await request(`/callback?state=${deniedUrl.searchParams.get("state")}&error=access_denied`, { auth: null,
      headers: { Cookie: denied.headers.get("set-cookie").split(";")[0] } })).headers.get("location")).toContain("failed");
  });
  it("identifies callback failures without including provider messages or secrets", async () => {
    mockProvider();
    for (const [providerError, expected] of [["invalid_client", "ml_invalid_client"], ["invalid_grant", "ml_invalid_authorization_code"], ["invalid_request", "ml_invalid_oauth_request"], ["", "ml_offline_access_required"]]) {
      oauthError = providerError; noRefreshToken = !providerError;
      const start = await request("/authorize", { method: "POST" });
      const state = new URL((await start.json()).url).searchParams.get("state");
      const response = await request(`/callback?state=${state}&code=PRIVATE_CODE`, { auth: null, headers: { Cookie: start.headers.get("set-cookie").split(";")[0] } });
      const target = response.headers.get("location");
      expect(target).toContain(`ml_error=${expected}`);
      expect(target).not.toContain("PRIVATE_CODE");
      expect(target).not.toContain("SENSITIVE_PROVIDER_MESSAGE");
      expect(target).not.toContain("secret-access");
      expect(target).not.toContain("secret-refresh");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    }
    expect(await (await request()).json()).toMatchObject({ connected: true });
  });
  it("upserts orders without duplicates and excludes buyer information", async () => {
    mockProvider();
    orders = [order];
    for (let i = 0; i < 2; i++) expect((await request("/sync", { method: "POST", body: dates })).status).toBe(200);
    const response = await request(`/records?${new URLSearchParams(dates)}`);
    const result = await response.json();
    expect(result.total).toBe(1);
    expect(result.records[0]).toMatchObject({ id: "111", grossCents: 2468, refundedCents: 500 });
    expect(result.summary).toEqual({ paidCents: 2468, refundedCents: 500 });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(providerCalls[0].options.headers.Authorization).toBe("Bearer secret-access");
    expect(providerCalls[0].url.searchParams.get("order.date_created.from")).toBe("2026-10-01T00:00:00.000-03:00");
    orders = [{ ...order, status: "cancelled" }];
    await request("/sync", { method: "POST", body: dates });
    const updated = await (await request(`/records?${new URLSearchParams(dates)}`)).json();
    expect(updated.records[0].status).toBe("cancelled");
    expect(updated.summary.paidCents).toBe(0);
  });
  it("keeps data isolated by local user", async () => {
    expect(await (await request("", { auth: otherToken })).json()).toMatchObject({ connected: false });
    expect((await request(`/records?${new URLSearchParams(dates)}`, { auth: otherToken })).status).toBe(409);
  });
  it("validates date ranges, pagination and resource types before calling the provider", async () => {
    mockProvider();
    for (const body of [{ ...dates, from: "2026-02-30" }, { ...dates, from: "2026-01-01" }, { ...dates, offset: -1 }, { ...dates, offset: 1 }, { ...dates, kind: "bad" }]) {
      expect((await request("/sync", { method: "POST", body })).status).toBe(400);
    }
    expect(providerCalls).toHaveLength(0);
  });
  it("returns the next page and rejects an oversized result window", async () => {
    mockProvider();
    orders = Array.from({ length: 50 }, (_, i) => ({ ...order, id: 1000 + i }));
    orderTotal = 51;
    expect(await (await request("/sync", { method: "POST", body: dates })).json()).toMatchObject({ nextOffset: 50, total: 51 });
    orders = [{ ...order, id: 1050 }];
    expect(await (await request("/sync", { method: "POST", body: { ...dates, offset: 50 } })).json()).toMatchObject({ nextOffset: null });
    orderTotal = 10000;
    expect((await request("/sync", { method: "POST", body: dates })).status).toBe(400);
  });
  it("does not commit a page with foreign seller data", async () => {
    mockProvider();
    orders = [{ ...order, id: 777 }, { ...order, id: 778, seller: { id: 999 } }];
    expect((await request("/sync", { method: "POST", body: dates })).status).toBe(502);
    expect(await db.queryOne("SELECT * FROM ml_records WHERE resource_id = '777'")).toBeNull();
  });
  it("syncs claims with seller filters and retrieves return details without addresses", async () => {
    mockProvider();
    claims = [{ id: 456, date_created: order.date_created, resource: "order", resource_id: 111, status: "opened", type: "mediations",
      related_entities: ["return"], players: [{ user_id: 123, role: "respondent", available_actions: [{ action: "return_review_ok", due_date: "2026-10-20" }] }] }];
    expect((await request("/sync", { method: "POST", body: { ...dates, kind: "claims" } })).status).toBe(200);
    expect(providerCalls[0].url.searchParams.get("players.user_id")).toBe("123");
    expect(providerCalls[0].url.searchParams.get("players.role")).toBe("respondent");
    const data = await (await request("/claims/456/return")).json();
    expect(data).toMatchObject({ id: "789", shipments: [{ status: "shipped", trackingNumber: "ABC" }] });
    expect(JSON.stringify(data)).not.toContain("PRIVATE");
    expect((await request("/claims/999/return")).status).toBe(404);
    expect((await request("/claims/456/return", { auth: otherToken })).status).toBe(409);
  });
  it("renews expired credentials and respects the shared refresh lease", async () => {
    mockProvider();
    await db.execute("UPDATE ml_connections SET expires_at = 0 WHERE user_id = 'ml-user'");
    orders = [];
    expect((await request("/sync", { method: "POST", body: dates })).status).toBe(200);
    expect(new URLSearchParams(providerCalls[0].options.body).get("grant_type")).toBe("refresh_token");
    await db.execute("UPDATE ml_connections SET expires_at = 0, refresh_lock_until = ? WHERE user_id = 'ml-user'", [Date.now() + 30000]);
    expect((await request("/sync", { method: "POST", body: dates })).status).toBe(409);
    await db.execute("UPDATE ml_connections SET refresh_lock_until = 0, expires_at = ?", [Date.now() + 3600000]);
  });
  it("maps provider errors without exposing provider messages or credentials", async () => {
    mockProvider();
    providerStatus = 429;
    let response = await request("/sync", { method: "POST", body: dates });
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "ml_rate_limited" });
    providerStatus = 401;
    response = await request("/sync", { method: "POST", body: dates });
    expect(await response.json()).toEqual({ error: "ml_reconnect_required" });
  });
  it("previews and replaces dashboard sales without duplicates or changes to other data", async () => {
    mockProvider();
    const stateService = require("../../src/services/state.service");
    await stateService.replaceBusinessState("ml-user", {
      platforms: [{ key: "ml", name: "Mercado Livre", icon: "ML", color: "#ffff00" }, { key: "other", name: "Outra", icon: "OT", color: "#ffffff" }],
      db: { "2026-Outubro": { days: [{ d: "03/10", ml: 999, orders_ml: 9, other: 40, orders_other: 2 },
        { d: "05/10", ml: 80, orders_ml: 1 }, { d: "20/10", ml: 70, orders_ml: 1 }], returns: { ml: 50 } } },
      goals: {}, currentMonth: "2026-Outubro"
    });
    orders = [order, { ...order, id: 112, date_created: "2026-10-04T01:30:00.000Z" },
      { ...order, id: 113, status: "cancelled" }, { ...order, id: 114, currency_id: "USD" }];
    await request("/sync", { method: "POST", body: dates });
    const input = { ...dates, platformKey: "ml" };
    const preview = await (await request("/dashboard/preview", { method: "POST", body: input })).json();
    expect(preview).toMatchObject({ grossCents: 4936, orders: 2, changedDays: 2, replacedDays: 2, excluded: 2 });
    expect(preview.days.find(day => day.day === "03/10")).toMatchObject({ amountCents: 4936, orders: 2, previousCents: 99900 });
    const applied = await request("/dashboard/apply", { method: "POST", body: { ...input, fingerprint: preview.fingerprint } });
    expect(applied.status).toBe(200);
    const state = await stateService.getBusinessState("ml-user");
    expect(state.db["2026-Outubro"].days.find(day => day.d === "03/10")).toMatchObject({ ml: 49.36, orders_ml: 2, other: 40, orders_other: 2 });
    expect(state.db["2026-Outubro"].days.find(day => day.d === "05/10")?.ml || 0).toBe(0);
    expect(state.db["2026-Outubro"].days.find(day => day.d === "20/10")).toMatchObject({ ml: 70, orders_ml: 1 });
    expect(state.db["2026-Outubro"].returns.ml).toBe(50);
    const repeated = await (await request("/dashboard/preview", { method: "POST", body: input })).json();
    expect(repeated.changedDays).toBe(0);
    expect((await request("/dashboard/apply", { method: "POST", body: { ...input, fingerprint: repeated.fingerprint } })).status).toBe(200);
  });
  it("requires a complete sync and rejects previews invalidated by business or API changes", async () => {
    mockProvider();
    const input = { ...dates, platformKey: "ml" };
    orders = [order];
    orderTotal = 51;
    await request("/sync", { method: "POST", body: dates });
    expect(await (await request("/dashboard/preview", { method: "POST", body: input })).json()).toEqual({ error: "ml_sync_incomplete" });
    orderTotal = undefined;
    await request("/sync", { method: "POST", body: dates });
    let preview = await (await request("/dashboard/preview", { method: "POST", body: input })).json();
    await db.execute("UPDATE app_settings SET updated_at = ? WHERE user_id = ?", [new Date().toISOString(), "ml-user"]);
    expect(await (await request("/dashboard/apply", { method: "POST", body: { ...input, fingerprint: preview.fingerprint } })).json()).toEqual({ error: "ml_preview_expired" });
    preview = await (await request("/dashboard/preview", { method: "POST", body: input })).json();
    orders = [];
    await request("/sync", { method: "POST", body: dates });
    expect(await (await request("/dashboard/apply", { method: "POST", body: { ...input, fingerprint: preview.fingerprint } })).json()).toEqual({ error: "ml_preview_expired" });
    const empty = await (await request("/dashboard/preview", { method: "POST", body: input })).json();
    expect(empty.orders).toBe(0);
    expect(empty.grossCents).toBe(0);
    expect((await request("/dashboard/preview", { method: "POST", body: input, auth: otherToken })).status).toBe(409);
    expect((await request("/dashboard/preview", { method: "POST", body: { ...input, platformKey: "missing" } })).status).toBe(400);
    expect((await request("/dashboard/apply", { method: "POST", body: input })).status).toBe(400);
  });
  it("disconnects and clears credentials, pending grants and cached records", async () => {
    expect((await request("", { method: "DELETE" })).status).toBe(200);
    expect(await (await request()).json()).toMatchObject({ connected: false });
    for (const table of ["ml_connections", "ml_oauth_states", "ml_records", "ml_sync_windows"]) {
      expect(await db.queryOne(`SELECT * FROM ${table} WHERE user_id = ?`, ["ml-user"])).toBeNull();
    }
  });
});
