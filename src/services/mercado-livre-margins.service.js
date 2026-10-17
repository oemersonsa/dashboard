const { queryOne, queryAll, withTransaction } = require("../db");
const ml = require("./mercado-livre.service");
const { calculate, COST_FIELDS, cents } = require("./order-margin.calc");
const fail = (code, statusCode = 400) => { throw Object.assign(new Error(code), { code, statusCode }); };
const DAY = 86400000;
const read = (path, headers, includeStatus = false) => ml.remote(path, { headers, signal: AbortSignal.timeout(8000) }, includeStatus);
function validId(id) { if (!/^\d{1,24}$/.test(String(id))) fail("ml_invalid_resource"); }
async function accountFor(user, id) {
  if (id !== undefined) validId(id);
  const account = await queryOne("SELECT seller_id FROM ml_connections WHERE user_id = ?", [user]);
  if (!account) fail("ml_not_connected", 409);
  if (id !== undefined && !await queryOne("SELECT 1 FROM ml_records WHERE user_id = ? AND seller_id = ? AND kind = 'orders' AND resource_id = ?", [user, account.seller_id, id])) fail("ml_resource_not_found", 404);
  return account;
}
const parse = value => value ? JSON.parse(value) : {};
const JOIN = `SELECT r.payload AS order_json, f.payload AS financial_json, f.updated_at AS financial_updated_at,
  c.payload AS costs_json, c.updated_at AS costs_updated_at FROM ml_records r
  LEFT JOIN ml_financials f ON f.user_id=r.user_id AND f.seller_id=r.seller_id AND f.order_id=r.resource_id
  LEFT JOIN ml_order_costs c ON c.user_id=r.user_id AND c.seller_id=r.seller_id AND c.order_id=r.resource_id`;
async function productsFor(user) {
  const row = await queryOne("SELECT pricing_json FROM app_settings WHERE user_id = ?", [user]);
  return parse(row?.pricing_json)?.products || [];
}
function analysis(row, products) {
  const order = parse(row.order_json), financial = parse(row.financial_json), settings = parse(row.costs_json);
  return { order, financial, settings, updatedAt: row.costs_updated_at || "", financialUpdatedAt: row.financial_updated_at || null,
    calculation: calculate(order, financial, settings, products) };
}
async function detail(user, id) {
  const account = await accountFor(user, id);
  const row = await queryOne(`${JOIN} WHERE r.user_id = ? AND r.seller_id = ? AND r.kind = 'orders' AND r.resource_id = ?`, [user, account.seller_id, id]);
  return analysis(row, await productsFor(user));
}
async function list(user, input) {
  const dates = ml.range(input);
  const offset = Number(input.offset || 0);
  const q = String(input.q || "").trim().toLocaleLowerCase("pt-BR");
  if (!Number.isInteger(offset) || offset < 0 || offset % 50 || offset > 9950 || q.length > 100 ||
      !["all", "paid", "cancelled"].includes(input.status || "all") || !["all", "pending", "profit", "loss"].includes(input.margin || "all")) fail("ml_invalid_filters");
  const account = await accountFor(user);
  const rows = await queryAll(`${JOIN} WHERE r.user_id = ? AND r.seller_id = ? AND r.kind = 'orders'
    AND r.date_created >= ? AND r.date_created <= ? ORDER BY r.date_created DESC, r.resource_id DESC LIMIT 10001`,
    [user, account.seller_id, new Date(dates.start).toISOString(), new Date(dates.end).toISOString()]);
  if (rows.length > 10000) fail("ml_range_too_large");
  const products = await productsFor(user);
  const data = rows.map(row => analysis(row, products)).filter(({ order, calculation: c }) =>
    (!q || [order.id, ...order.items.map(item => `${item.title} ${item.sku}`)].some(value => value.toLocaleLowerCase("pt-BR").includes(q))) &&
    (!input.status || input.status === "all" || order.status === input.status) &&
    (!input.margin || input.margin === "all" || (input.margin === "pending" && c.eligible && !c.ready) ||
      (input.margin === "profit" && c.ready && c.profitCents >= 0) || (input.margin === "loss" && c.ready && c.profitCents < 0)));
  const ready = data.filter(item => item.calculation.ready);
  const sales = ready.reduce((sum, item) => sum + item.order.grossCents, 0);
  const profit = ready.reduce((sum, item) => sum + item.calculation.profitCents, 0);
  return { total: data.length, nextOffset: offset + 50 < data.length ? offset + 50 : null,
    summary: { calculated: ready.length, pending: data.filter(item => item.calculation.eligible && !item.calculation.ready).length,
      salesCents: sales, profitCents: profit, marginPercent: sales > 0 ? profit / sales * 100 : null,
      estimated: ready.filter(item => item.calculation.estimated).length },
    records: data.slice(offset, offset + 50).map(({ order, calculation, financialUpdatedAt }) => ({ order, calculation, financialUpdatedAt })) };
}
function billingData(data, id, status) {
  const result = data.results?.find(row => String(row.order_id) === id);
  if (!Array.isArray(data.results) || !Number.isInteger(data.total)) fail("ml_invalid_response", 502);
  const complete = status === 200 && !(data.errors?.length) && data.total <= data.results.length;
  const charges = [];
  const seen = new Set();
  for (const entry of result?.details || []) {
    const info = entry.charge_info || {};
    const type = info.detail_type;
    const amount = cents(info.detail_amount);
    const chargeId = `${type}:${info.detail_id}`;
    if (!info.detail_id || seen.has(chargeId)) continue;
    seen.add(chargeId);
    const related = [...new Set((entry.sales_info || []).map(sale => String(sale.order_id)))];
    const shared = related.length > 1 || (entry.items_info || []).some(item => item.order_id && String(item.order_id) !== id);
    const currency = entry.currency_info?.currency_id;
    const covered = ["CV", "CXD"].includes(info.detail_sub_type);
    const safe = amount !== null && ["CHARGE", "BONUS"].includes(type) && currency === "BRL" && !shared && related.includes(id);
    charges.push({ id: chargeId, label: String(info.transaction_detail || info.detail_sub_type || "Cobrança"),
      subtype: String(info.detail_sub_type || ""), type, amountCents: amount, signedCents: type === "BONUS" && amount !== null ? -amount : amount,
      currency: currency || null, status: info.status_description || info.status || info.legal_document_status_description || info.legal_document_status || "", shared, covered,
      selectable: complete && safe && !covered });
  }
  const provisional = (result?.details || []).some(entry => entry.charge_info?.legal_document_status !== "PROCESSED");
  return { status: !complete ? "partial" : !result ? "pending" : provisional ? "provisional" : "available", checkedAt: new Date().toISOString(),
    saleFeeCents: complete ? cents(result?.sale_fee?.net) : null, charges };
}
async function shippingData(user, account, order, headers) {
  if (!order.shippingId) return { costCents: null, reason: "Sem envio identificado. Informe o custo do vendedor, inclusive zero quando não houver cobrança." };
  const costs = await read(`/shipments/${order.shippingId}/costs`, headers);
  const sender = costs.senders?.find(item => String(item.user_id) === account.seller_id);
  const totalCents = cents(sender?.cost);
  if (totalCents === null) return { costCents: null, reason: "O custo de envio do vendedor ainda não foi informado pela API." };
  const items = await read(`/shipments/${order.shippingId}/items`, headers);
  if (!Array.isArray(items)) fail("ml_invalid_response", 502);
  const ids = [...new Set(items.filter(item => String(item.sender_id) === account.seller_id).map(item => String(item.order_id)))].sort();
  if (ids.length > 100) return { costCents: null, reason: "Muitos pedidos compartilham este envio. Informe o rateio de frete manualmente." };
  if (!ids.includes(order.id)) return { costCents: null, reason: "Não foi possível confirmar quais pedidos dividem este envio." };
  if (ids.length === 1 || totalCents === 0) return { costCents: totalCents, allocated: false, totalCents, orderIds: ids };
  const rows = await queryAll(`SELECT resource_id, payload FROM ml_records WHERE user_id = ? AND seller_id = ? AND kind = 'orders'
    AND resource_id IN (${ids.map(() => "?").join(",")})`, [user, account.seller_id, ...ids]);
  const orders = new Map(rows.map(row => [row.resource_id, JSON.parse(row.payload)]));
  orders.set(order.id, order);
  if (ids.some(id => !orders.has(id) || orders.get(id).currency !== order.currency || !(orders.get(id).grossCents > 0))) {
    return { costCents: null, totalCents, orderIds: ids, reason: "Envio compartilhado: sincronize todos os pedidos do pacote ou informe o frete deste pedido manualmente." };
  }
  const gross = ids.reduce((sum, id) => sum + orders.get(id).grossCents, 0);
  let cumulative = 0;
  let previous = 0;
  let share = 0;
  for (const id of ids) {
    cumulative += orders.get(id).grossCents;
    const boundary = Math.round(totalCents * cumulative / gross);
    if (id === order.id) share = boundary - previous;
    previous = boundary;
  }
  return { costCents: share, allocated: true, totalCents, orderIds: ids, reason: "Frete do vendedor rateado entre os pedidos pelo valor dos produtos." };
}
async function refresh(user, id) {
  await accountFor(user, id);
  const account = await ml.connection(user);
  const headers = { Authorization: `Bearer ${account.accessToken}` };
  const raw = await read(`/orders/${id}`, headers);
  if (String(raw.seller?.id) !== account.seller_id || String(raw.id) !== id) fail("ml_resource_not_found", 404);
  const order = ml.orderRecord(raw);
  const old = await queryOne("SELECT payload FROM ml_financials WHERE user_id = ? AND seller_id = ? AND order_id = ?", [user, account.seller_id, id]);
  const cached = parse(old?.payload);
  const warnings = [];
  let shipping;
  try { shipping = await shippingData(user, account, order, headers); }
  catch (error) { shipping = { costCents: null, reason: error.code || "ml_unavailable" }; warnings.push("Não foi possível consultar o frete. Você pode informar o valor manualmente."); }
  let billing = cached.billing;
  if (!billing?.checkedAt || Date.now() - Date.parse(billing.checkedAt) >= DAY) {
    try {
      const response = await read(`/billing/integration/group/ML/order/details?order_ids=${id}`, headers, true);
      billing = billingData(response.data, id, response.status);
    } catch (error) { billing = { status: "unavailable", checkedAt: new Date().toISOString(), charges: [], saleFeeCents: null, error: error.code || "ml_unavailable" }; }
  }
  if (billing.status === "provisional") warnings.push("Faturamento ainda em processamento. As cobranças podem ser ajustadas; a margem será uma estimativa.");
  else if (billing.status !== "available") warnings.push("Faturamento incompleto ou indisponível. A margem será uma estimativa com os valores conferidos por você.");
  const financial = { shipping, billing, warnings };
  const timestamp = new Date().toISOString();
  await withTransaction(async tx => {
    const current = (await tx.execute({ sql: "SELECT generation FROM ml_connections WHERE user_id = ?", args: [user] })).rows[0];
    if (current?.generation !== account.generation) fail("ml_connection_changed", 409);
    await tx.execute({ sql: "UPDATE ml_records SET payload = ?, synced_at = ? WHERE user_id = ? AND seller_id = ? AND kind = 'orders' AND resource_id = ?",
      args: [JSON.stringify(order), timestamp, user, account.seller_id, id] });
    await tx.execute({ sql: `INSERT INTO ml_financials (user_id, seller_id, order_id, payload, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, seller_id, order_id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at`,
      args: [user, account.seller_id, id, JSON.stringify(financial), timestamp] });
  });
  return detail(user, id);
}
async function saveCosts(user, id, input) {
  const account = await accountFor(user, id);
  if (!input || typeof input !== "object" || !input.costs || typeof input.costs !== "object" || Array.isArray(input.costs) || typeof input.expectedUpdatedAt !== "string") fail("ml_invalid_costs");
  const settings = input.costs;
  if (Object.keys(settings).some(field => ![...COST_FIELDS, "includedChargeIds", "reviewed", "note"].includes(field)) ||
    COST_FIELDS.some(field => settings[field] !== null && (!Number.isSafeInteger(settings[field]) || settings[field] < 0 || settings[field] > 1e12)) ||
    typeof settings.reviewed !== "boolean" || typeof settings.note !== "string" || settings.note.length > 1000 ||
    !Array.isArray(settings.includedChargeIds) || settings.includedChargeIds.length > 200 || settings.includedChargeIds.some(id => typeof id !== "string" || id.length > 100) ||
    new Set(settings.includedChargeIds).size !== settings.includedChargeIds.length) fail("ml_invalid_costs");
  await withTransaction(async tx => {
    const currentAccount = (await tx.execute({ sql: "SELECT seller_id FROM ml_connections WHERE user_id = ?", args: [user] })).rows[0];
    if (currentAccount?.seller_id !== account.seller_id) fail("ml_connection_changed", 409);
    const current = (await tx.execute({ sql: "SELECT updated_at FROM ml_order_costs WHERE user_id = ? AND seller_id = ? AND order_id = ?", args: [user, account.seller_id, id] })).rows[0];
    if ((current?.updated_at || "") !== input.expectedUpdatedAt) fail("ml_cost_conflict", 409);
    const financial = (await tx.execute({ sql: "SELECT payload FROM ml_financials WHERE user_id = ? AND seller_id = ? AND order_id = ?", args: [user, account.seller_id, id] })).rows[0];
    const allowed = new Set((parse(financial?.payload).billing?.charges || []).filter(charge => charge.selectable).map(charge => charge.id));
    if (settings.includedChargeIds.some(id => !allowed.has(id))) fail("ml_invalid_charges");
    const timestamp = new Date(Math.max(Date.now(), (Date.parse(current?.updated_at) || 0) + 1)).toISOString();
    await tx.execute({ sql: `INSERT INTO ml_order_costs (user_id, seller_id, order_id, payload, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, seller_id, order_id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at`,
      args: [user, account.seller_id, id, JSON.stringify(settings), timestamp] });
  });
  return detail(user, id);
}
module.exports = { list, detail, refresh, saveCosts };
