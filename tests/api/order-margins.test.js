import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import { createRequire } from "node:module";
import { resetTestDb, cleanupTestDb } from "../setup/test-db.js";
const require = createRequire(import.meta.url);
const nativeFetch = globalThis.fetch;
const BASE = "/api/integrations/mercado-livre";
let info, db, token, otherToken;
let providerCalls = [], billingStatus = 200, shippingStatus = 200, foreignSeller = false;
const rawOrder = (id, price, quantity, sku) => ({ id, seller: { id: 123 }, status: "paid", currency_id: "BRL", date_created: "2026-10-03T12:00:00-03:00", shipping: { id: 700 }, pack_id: 900,
  order_items: [{ quantity, unit_price: price, sale_fee: price * .1, item: { id: `MLB${id}`, title: `Produto ${sku}`, seller_sku: sku } }],
  payments: [{ marketplace_fee: 99, transaction_amount_refunded: 0 }], buyer: { first_name: "PRIVATE_BUYER" } });
const orders = [rawOrder(111, 50, 2, "SKU-A"), rawOrder(222, 300, 1, "SKU-B")];
const charge = (id, type, subtype, amount, orderIds = [111]) => ({ charge_info: { detail_id: id, detail_type: type, detail_sub_type: subtype, detail_amount: amount, transaction_detail: `Cobrança ${id}` },
  sales_info: orderIds.map(order_id => ({ order_id, payer_nickname: "PRIVATE_BUYER" })), currency_info: { currency_id: "BRL" } });
const costs = { productCostCents: null, packagingCents: null, taxCents: 600, otherCents: 100,
  feeOverrideCents: null, shippingOverrideCents: null, productRefundCents: null,
  includedChargeIds: [], reviewed: true, note: "Conferido" };
async function request(path, { method = "GET", body, auth = token } = {}) {
  return nativeFetch(info.url + BASE + path, { method, redirect: "manual", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
}
function mockProvider() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
    const parsed = new URL(url); expect(parsed.origin).toBe("https://api.mercadolibre.com");
    providerCalls.push(parsed.pathname);
    let data;
    let status = 200;
    if (parsed.pathname === "/oauth/token") data = { access_token: "access", refresh_token: "refresh", expires_in: 3600, user_id: 123 };
    else if (parsed.pathname === "/users/me") data = { id: 123, nickname: "Loja" };
    else if (parsed.pathname === "/orders/search") data = { results: orders, paging: { total: orders.length } };
    else if (/^\/orders\/\d+$/.test(parsed.pathname)) {
      data = { ...orders.find(order => String(order.id) === parsed.pathname.split("/").at(-1)) };
      if (foreignSeller) data.seller = { id: 999 };
    } else if (parsed.pathname === "/shipments/700/costs") { data = { senders: [{ user_id: 123, cost: 20 }], receiver: { cost: 7, address: "PRIVATE_ADDRESS" } }; status = shippingStatus; }
    else if (parsed.pathname === "/shipments/700/items") data = orders.map(order => ({ sender_id: 123, order_id: order.id }));
    else if (parsed.pathname === "/billing/integration/group/ML/order/details") {
      expect(parsed.searchParams.get("order_ids")).toMatch(/^\d+$/);
      status = billingStatus;
      data = { total: 1, results: [{ order_id: 111, sale_fee: { gross: 10, net: 8, rebate: 2 }, details: [
        charge(1, "CHARGE", "CV", 8), charge(2, "CHARGE", "CXD", 20, [111, 222]), charge(3, "CHARGE", "SERVICE", 3), charge(4, "BONUS", "SERVICE", 1)
      ] }] };
    } else throw new Error(`Unexpected path ${parsed.pathname}`);
    return new Response(JSON.stringify(data), { status });
  });
}
beforeAll(async () => {
  resetTestDb();
  Object.assign(require("../../src/config/env"), { ML_CLIENT_ID: "id", ML_CLIENT_SECRET: "secret", ML_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"),
    APP_ORIGIN: "https://kanri.example", ML_REDIRECT_URI: "https://kanri.example/api/integrations/mercado-livre/callback" });
  info = await require("../../src/server/index").startServer({ port: 0, host: "127.0.0.1" }); db = require("../../src/db");
  for (const username of ["margin-user", "margin-other"]) {
    const response = await nativeFetch(info.url + "/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "safe-password-123" }) });
    const data = await response.json();
    if (username === "margin-user") token = data.sessionToken; else otherToken = data.sessionToken;
  }
  mockProvider();
  const authorize = await request("/authorize", { method: "POST" });
  const state = new URL((await authorize.json()).url).searchParams.get("state");
  const callback = await nativeFetch(info.url + BASE + `/callback?state=${state}&code=test`, { redirect: "manual", headers: { Cookie: authorize.headers.get("set-cookie").split(";")[0] } });
  expect(callback.headers.get("location")).toContain("connected");
  await require("../../src/services/state.service").replaceBusinessState("margin-user", { platforms: [{ key: "ml", name: "Mercado Livre", icon: "ML", color: "#ffff00" }], db: {}, goals: {},
    pricing: { products: [{ sku: "SKU-A", productCost: 20, packagingCost: 1 }, { sku: "SKU-B", productCost: 100, packagingCost: 2 }] } });
  vi.restoreAllMocks();
});
beforeEach(async () => {
  providerCalls = []; billingStatus = 200; shippingStatus = 200; foreignSeller = false; mockProvider();
  await db.execute("DELETE FROM ml_financials"); await db.execute("DELETE FROM ml_order_costs");
  expect((await request("/sync", { method: "POST", body: { from: "2026-10-01", to: "2026-10-17", kind: "orders" } })).status).toBe(200);
  providerCalls = [];
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await require("../../src/server/index").stopServer(); await cleanupTestDb(); });

describe("API de margens por pedido", () => {
  it("lista pedidos com tarifa por unidade e custos de SKU, sem dados do comprador", async () => {
    const response = await request("/margins?from=2026-10-01&to=2026-10-17");
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.total).toBe(2);
    const first = data.records.find(row => row.order.id === "111");
    expect(first.order.saleFeeCents).toBe(1000);
    expect(first.calculation.costs.productCostCents).toBe(4000);
    expect(first.calculation.profitCents).toBeNull();
    expect(JSON.stringify(data)).not.toContain("PRIVATE_BUYER");
    expect(providerCalls).toHaveLength(0);
  });
  it("consulta taxas e rateia frete compartilhado sem duplicar tarifa", async () => {
    const data = await (await request("/margins/111/refresh", { method: "POST" })).json();
    expect(data.financial.shipping).toMatchObject({ costCents: 500, totalCents: 2000, allocated: true });
    expect(data.calculation.costs.feeCents).toBe(800);
    expect(data.financial.billing.charges.filter(charge => charge.selectable)).toHaveLength(2);
    expect(JSON.stringify(data)).not.toContain("PRIVATE");
    const second = await (await request("/margins/222/refresh", { method: "POST" })).json();
    expect(second.financial.shipping.costCents).toBe(1500);
    await request("/margins/111/refresh", { method: "POST" });
    expect(providerCalls.filter(path => path.includes("billing"))).toHaveLength(2);
  });
  it("salva custos, calcula margem e seleciona somente adicionais explícitos", async () => {
    await request("/margins/111/refresh", { method: "POST" });
    const saved = await request("/margins/111/costs", { method: "POST", body: { expectedUpdatedAt: "", costs: { ...costs, includedChargeIds: ["CHARGE:3", "BONUS:4"] } } });
    expect(saved.status).toBe(200);
    const data = await saved.json();
    expect(data.calculation).toMatchObject({ ready: true, profitCents: 3600, marginPercent: 36, extraCents: 200, estimated: true });
    const reloaded = await (await request("/margins/111")).json();
    expect(reloaded.settings.includedChargeIds).toEqual(["CHARGE:3", "BONUS:4"]);
    const list = await (await request("/margins?from=2026-10-01&to=2026-10-17&margin=profit")).json();
    expect(list.total).toBe(1); expect(list.summary.profitCents).toBe(3600); expect(list.summary.marginPercent).toBe(36);
  });
  it("não calcula frete integral quando falta outro pedido do envio", async () => {
    await db.execute("DELETE FROM ml_records WHERE resource_id = '222'");
    const data = await (await request("/margins/111/refresh", { method: "POST" })).json();
    expect(data.financial.shipping.costCents).toBeNull();
    expect(data.financial.shipping.reason).toContain("compartilhado");
  });
  it("aceita ajustes manuais quando a API de frete ou faturamento está indisponível", async () => {
    shippingStatus = 403; billingStatus = 403;
    const data = await (await request("/margins/111/refresh", { method: "POST" })).json();
    expect(data.financial.billing.status).toBe("unavailable"); expect(data.financial.shipping.costCents).toBeNull();
    expect(data.calculation.ready).toBe(false);
    const saved = await (await request("/margins/111/costs", { method: "POST", body: { expectedUpdatedAt: "", costs: { ...costs, shippingOverrideCents: 500, feeOverrideCents: 800 } } })).json();
    expect(saved.calculation).toMatchObject({ ready: true, profitCents: 3800, estimated: true });
  });
  it("não usa tarifa de um relatório parcial nem permite incluir suas cobranças", async () => {
    billingStatus = 206;
    const data = await (await request("/margins/111/refresh", { method: "POST" })).json();
    expect(data.financial.billing.status).toBe("partial");
    expect(data.calculation.costs.feeCents).toBe(1000);
    expect(data.financial.billing.charges.some(charge => charge.selectable)).toBe(false);
  });
  it("valida valores e impede duplicar cobranças já contempladas", async () => {
    await request("/margins/111/refresh", { method: "POST" });
    for (const invalid of [{ ...costs, taxCents: -1 }, { ...costs, otherCents: 1.5 }, { ...costs, includedChargeIds: ["CHARGE:1"] }, { ...costs, includedChargeIds: ["CHARGE:2"] }]) {
      expect((await request("/margins/111/costs", { method: "POST", body: { costs: invalid, expectedUpdatedAt: "" } })).status).toBe(400);
    }
    expect((await request("/margins/111/costs", { method: "POST", body: { costs, expectedUpdatedAt: "" } })).status).toBe(200);
    expect((await request("/margins/111/costs", { method: "POST", body: { costs, expectedUpdatedAt: "" } })).status).toBe(409);
  });
  it("mantém isolamento por usuário e rejeita pedidos de outro vendedor", async () => {
    expect((await request("/margins/111", { auth: null })).status).toBe(401);
    expect((await request("/margins/111", { auth: otherToken })).status).toBe(409);
    expect((await request("/margins/999")).status).toBe(404);
    foreignSeller = true;
    expect((await request("/margins/111/refresh", { method: "POST" })).status).toBe(404);
    expect(await db.queryOne("SELECT * FROM ml_financials")).toBeNull();
  });
  it("calcula a margem consolidada pela receita, sem tirar média dos percentuais", async () => {
    for (const id of ["111", "222"]) {
      await request(`/margins/${id}/refresh`, { method: "POST" });
      expect((await request(`/margins/${id}/costs`, { method: "POST", body: { expectedUpdatedAt: "", costs } })).status).toBe(200);
    }
    const result = await (await request("/margins?from=2026-10-01&to=2026-10-17")).json();
    expect(result.summary).toMatchObject({ calculated: 2, salesCents: 40000, profitCents: 18400, marginPercent: 46 });
  });
  it("preserva os custos manuais ao desconectar, mas limpa as credenciais e consultas", async () => {
    await request("/margins/111/refresh", { method: "POST" });
    await request("/margins/111/costs", { method: "POST", body: { expectedUpdatedAt: "", costs } });
    expect((await request("", { method: "DELETE" })).status).toBe(200);
    const stored = await db.queryOne("SELECT payload FROM ml_order_costs WHERE user_id = ? AND seller_id = ? AND order_id = ?", ["margin-user", "123", "111"]);
    expect(JSON.parse(stored.payload).note).toBe("Conferido");
    expect(await db.queryOne("SELECT * FROM ml_financials")).toBeNull();
    expect((await request("/margins/111")).status).toBe(409);
  });
});
