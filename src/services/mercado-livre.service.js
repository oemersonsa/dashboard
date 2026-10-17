const crypto = require("crypto");
const config = require("../config/env");
const { queryOne, queryAll, execute, withTransaction } = require("../db");

const API = "https://api.mercadolibre.com";
const PAGE_SIZE = 50;
function fail(code, statusCode = 400) {
  return Object.assign(new Error(code), { code, statusCode });
}
function key() {
  const value = config.ML_TOKEN_ENCRYPTION_KEY;
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value || "")) throw fail("ml_not_configured", 503);
  return Buffer.from(value, "base64");
}
function configuration() {
  const issues = [];
  if (!config.ML_CLIENT_ID) issues.push("client_id_missing");
  if (!config.ML_CLIENT_SECRET) issues.push("client_secret_missing");
  try { key(); } catch { issues.push("invalid_encryption_key"); }
  let appOrigin = "";
  let redirectOrigin = "";
  try {
    const app = new URL(config.APP_ORIGIN);
    if (!["http:", "https:"].includes(app.protocol) || app.username || app.password) throw new Error();
    appOrigin = app.origin;
  } catch { issues.push("invalid_app_origin"); }
  try {
    const redirect = new URL(config.ML_REDIRECT_URI);
    if (redirect.pathname !== "/api/integrations/mercado-livre/callback" || redirect.search || redirect.hash ||
      redirect.username || redirect.password || !(redirect.protocol === "https:" ||
        (redirect.protocol === "http:" && ["localhost", "127.0.0.1"].includes(redirect.hostname)))) throw new Error();
    redirectOrigin = redirect.origin;
  } catch { issues.push("invalid_redirect_uri"); }
  if (appOrigin && redirectOrigin && appOrigin !== redirectOrigin) issues.push("origin_mismatch");
  return { issues, appOrigin, redirectOrigin };
}
function configured() {
  return configuration().issues.length === 0;
}
function requireConfig() {
  if (!configured()) throw fail("ml_not_configured", 503);
}
function encrypt(value, user) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(user));
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}
function decrypt(value, user) {
  try {
    const data = Buffer.from(value, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
    decipher.setAAD(Buffer.from(user));
    decipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString());
  } catch { throw fail("ml_credentials_unavailable", 503); }
}
async function remote(path, options = {}, includeStatus = false) {
  let response;
  try {
    response = await fetch(API + path, { ...options, redirect: "error", signal: options.signal || AbortSignal.timeout(15000) });
  } catch { throw fail("ml_unavailable", 502); }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (path === "/oauth/token" && body?.error === "invalid_client") throw fail("ml_invalid_client", 409);
    if (path === "/oauth/token" && body?.error === "invalid_request") throw fail("ml_invalid_oauth_request", 409);
    if (path === "/oauth/token" && body?.error === "invalid_grant") {
      const grant = new URLSearchParams(options.body).get("grant_type");
      throw fail(grant === "authorization_code" ? "ml_invalid_authorization_code" : "ml_reconnect_required", 409);
    }
    const codes = { 401: "ml_reconnect_required", 403: "ml_permission_denied", 404: "ml_resource_not_found", 429: "ml_rate_limited" };
    throw fail(codes[response.status] || "ml_api_error", response.status === 429 ? 429 : 502);
  }
  if (!body || typeof body !== "object") throw fail("ml_invalid_response", 502);
  return includeStatus ? { data: body, status: response.status } : body;
}
async function tokenRequest(params) {
  return remote("/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.ML_CLIENT_ID, client_secret: config.ML_CLIENT_SECRET, ...params }).toString()
  });
}
function validTokens(tokens) {
  if (!tokens.access_token || !(Number(tokens.expires_in) > 0) || !tokens.user_id) {
    throw fail("ml_invalid_response", 502);
  }
  if (!tokens.refresh_token) throw fail("ml_offline_access_required", 409);
  return Date.now() + Number(tokens.expires_in) * 1000;
}
async function status(user) {
  const row = await queryOne("SELECT seller_id, nickname FROM ml_connections WHERE user_id = ?", [user]);
  const setup = configuration();
  return { configured: setup.issues.length === 0, configuration: setup,
    connected: Boolean(row), sellerId: row?.seller_id || null, nickname: row?.nickname || null };
}
async function authorize(user) {
  requireConfig();
  const state = crypto.randomBytes(32).toString("base64url");
  const verifier = crypto.randomBytes(32).toString("base64url");
  await withTransaction(async tx => {
    await tx.execute({ sql: "DELETE FROM ml_oauth_states WHERE user_id = ? OR expires_at < ?", args: [user, Date.now()] });
    await tx.execute({
      sql: "INSERT INTO ml_oauth_states (state_hash, user_id, verifier, expires_at) VALUES (?, ?, ?, ?)",
      args: [crypto.createHash("sha256").update(state).digest("hex"), user, encrypt(verifier, user), Date.now() + 600000]
    });
  });
  const params = new URLSearchParams({ response_type: "code", client_id: config.ML_CLIENT_ID,
    redirect_uri: config.ML_REDIRECT_URI, state, code_challenge_method: "S256",
    code_challenge: crypto.createHash("sha256").update(verifier).digest("base64url") });
  return { state, url: `https://auth.mercadolivre.com.br/authorization?${params}` };
}
async function callback(params, cookieState) {
  requireConfig();
  const state = params.get("state") || "";
  if (!state || state.length > 100) throw fail("ml_invalid_oauth_state");
  if (!cookieState) throw fail("ml_oauth_cookie_missing");
  if (state !== cookieState) throw fail("ml_oauth_browser_mismatch");
  const hash = crypto.createHash("sha256").update(state).digest("hex");
  const pending = await withTransaction(async tx => {
    const result = await tx.execute({ sql: "SELECT * FROM ml_oauth_states WHERE state_hash = ?", args: [hash] });
    await tx.execute({ sql: "DELETE FROM ml_oauth_states WHERE state_hash = ?", args: [hash] });
    return result.rows[0];
  });
  if (!pending || Number(pending.expires_at) < Date.now()) throw fail("ml_oauth_expired");
  if (params.has("error") || !params.get("code")) throw fail("ml_authorization_denied");
  const tokens = await tokenRequest({ grant_type: "authorization_code", code: params.get("code"),
    redirect_uri: config.ML_REDIRECT_URI, code_verifier: decrypt(pending.verifier, pending.user_id) });
  const expires = validTokens(tokens);
  const seller = await remote("/users/me", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  if (String(seller.id) !== String(tokens.user_id)) throw fail("ml_invalid_response", 502);
  await execute(`INSERT INTO ml_connections (user_id, seller_id, nickname, tokens, expires_at, generation)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET seller_id=excluded.seller_id,
    nickname=excluded.nickname, tokens=excluded.tokens, expires_at=excluded.expires_at,
    generation=excluded.generation, refresh_lock_until=0`,
  [pending.user_id, String(seller.id), String(seller.nickname || seller.id), encrypt(tokens, pending.user_id), expires, crypto.randomUUID()]);
}
async function connection(user) {
  requireConfig();
  const row = await queryOne("SELECT * FROM ml_connections WHERE user_id = ?", [user]);
  if (!row) throw fail("ml_not_connected", 409);
  let tokens = decrypt(row.tokens, user);
  if (Number(row.expires_at) <= Date.now() + 60000) {
    // Refresh tokens are single use. The database lease also covers other server instances.
    const lease = Date.now() + 30000;
    const lock = await execute(`UPDATE ml_connections SET refresh_lock_until = ?
      WHERE user_id = ? AND generation = ? AND refresh_lock_until < ?`, [lease, user, row.generation, Date.now()]);
    if (!lock.rowsAffected) throw fail("ml_connection_busy", 409);
    try {
      tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
      const expires = validTokens(tokens);
      if (String(tokens.user_id) !== row.seller_id) throw fail("ml_invalid_response", 502);
      const generation = crypto.randomUUID();
      const result = await execute(`UPDATE ml_connections SET tokens = ?, expires_at = ?, generation = ?, refresh_lock_until = 0
        WHERE user_id = ? AND generation = ? AND refresh_lock_until = ?`,
      [encrypt(tokens, user), expires, generation, user, row.generation, lease]);
      if (!result.rowsAffected) throw fail("ml_connection_changed", 409);
      row.generation = generation;
    } finally {
      await execute("UPDATE ml_connections SET refresh_lock_until = 0 WHERE user_id = ? AND generation = ? AND refresh_lock_until = ?",
        [user, row.generation, lease]);
    }
  }
  return { ...row, accessToken: tokens.access_token };
}
function range(input) {
  if (!input || typeof input !== "object") throw fail("ml_invalid_date_range");
  const { from, to } = input;
  const valid = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(from) || !valid(to) || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 30) throw fail("ml_invalid_date_range");
  return { from, to, start: `${from}T00:00:00.000-03:00`, end: `${to}T23:59:59.999-03:00` };
}
function paging(input) {
  const kind = input.kind || "orders";
  const offset = Number(input.offset || 0);
  if (!["orders", "claims"].includes(kind) || !Number.isInteger(offset) || offset < 0 || offset % PAGE_SIZE !== 0 || offset > 9900) {
    throw fail("ml_invalid_pagination");
  }
  return { kind, offset };
}
const money = value => Math.max(0, Math.round((Number(value) || 0) * 100));
function orderRecord(order) {
  if (!order.id || !order.date_created || !Array.isArray(order.order_items)) throw fail("ml_invalid_response", 502);
  if (!order.order_items.length || order.order_items.some(item => !Number.isInteger(item.quantity) || item.quantity <= 0 ||
    typeof item.unit_price !== "number" || !Number.isFinite(item.unit_price) || item.unit_price < 0)) throw fail("ml_invalid_response", 502);
  const cents = value => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
  const items = order.order_items.map(item => ({ title: String(item.item?.title || ""), id: String(item.item?.id || ""),
    sku: String(item.item?.seller_sku || item.item?.seller_custom_field || ""), quantity: Number(item.quantity) || 0,
    unitPrice: Number(item.unit_price) || 0, saleFeeCents: cents(item.sale_fee) }));
  const itemFeesKnown = items.length > 0 && items.every(item => item.saleFeeCents !== null);
  const payments = order.payments || [];
  const paymentFeesKnown = payments.length > 0 && payments.every(payment => cents(payment.marketplace_fee) !== null);
  return { id: String(order.id), packId: order.pack_id ? String(order.pack_id) : null,
    cancellationCode: String(order.cancel_detail?.code || ""),
    status: String(order.status || ""), dateCreated: order.date_created, currency: order.currency_id,
    grossCents: items.reduce((sum, item) => sum + money(item.unitPrice) * item.quantity, 0),
    saleFeeCents: itemFeesKnown ? items.reduce((sum, item) => sum + item.saleFeeCents * item.quantity, 0)
      : paymentFeesKnown ? payments.reduce((sum, payment) => sum + cents(payment.marketplace_fee), 0) : null,
    refundsKnown: payments.length > 0 && payments.every(payment => cents(payment.transaction_amount_refunded) !== null),
    refundedCents: (order.payments || []).reduce((sum, payment) => sum + money(payment.transaction_amount_refunded), 0),
    items, shippingId: order.shipping?.id ? String(order.shipping.id) : null };
}
function claimRecord(claim, sellerId) {
  if (!claim.id || !claim.date_created || !(claim.players || []).some(player =>
    String(player.user_id ?? player.id) === sellerId && player.role === "respondent")) throw fail("ml_invalid_response", 502);
  return { id: String(claim.id), resource: claim.resource, resourceId: String(claim.resource_id || ""),
    status: claim.status, type: claim.type, stage: claim.stage, reason: claim.reason_id,
    dateCreated: claim.date_created, hasReturn: claim.type === "return" || claim.related_entities?.includes("return") || false,
    actions: (claim.players || []).filter(player => String(player.user_id ?? player.id) === sellerId)
      .flatMap(player => player.available_actions || []).map(action => ({ action: action.action, dueDate: action.due_date })) };
}
async function sync(user, input) {
  const dates = range(input);
  const { kind, offset } = paging(input);
  const account = await connection(user);
  let runId = "";
  if (kind === "orders") {
    if (offset === 0) {
      runId = crypto.randomUUID();
      await withTransaction(async tx => {
        await tx.execute({ sql: `DELETE FROM ml_sync_windows WHERE user_id = ? AND seller_id = ?
          AND from_date <= ? AND to_date >= ?`, args: [user, account.seller_id, dates.to, dates.from] });
        await tx.execute({ sql: `INSERT INTO ml_sync_windows
          (user_id, seller_id, from_date, to_date, run_id, next_offset, metrics_version) VALUES (?, ?, ?, ?, ?, 0, 2)`,
          args: [user, account.seller_id, dates.from, dates.to, runId] });
      });
    } else {
      const run = await queryOne(`SELECT run_id, next_offset FROM ml_sync_windows
        WHERE user_id = ? AND seller_id = ? AND from_date = ? AND to_date = ?`, [user, account.seller_id, dates.from, dates.to]);
      if (!run || run.next_offset === null || Number(run.next_offset) !== offset) throw fail("ml_sync_restart_required", 409);
      runId = run.run_id;
    }
  }
  const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) });
  if (kind === "orders") {
    params.set("seller", account.seller_id);
    // Search as seller may omit cancelled orders unless explicitly requested.
    params.set("order.status", "paid,cancelled");
    params.set("order.date_created.from", dates.start);
    params.set("order.date_created.to", dates.end);
    params.set("sort", "date_asc");
  } else {
    params.set("players.user_id", account.seller_id);
    params.set("players.role", "respondent");
    params.set("range", `date_created:after:${dates.start},before:${dates.end}`);
    params.set("sort", "date_created:asc");
  }
  const page = await remote(`${kind === "orders" ? "/orders/search" : "/post-purchase/v1/claims/search"}?${params}`,
    { headers: { Authorization: `Bearer ${account.accessToken}` } });
  const source = kind === "orders" ? page.results : page.data;
  if (!Array.isArray(source) || !Number.isInteger(page.paging?.total) || page.paging.total < 0 ||
    (!source.length && offset < page.paging.total)) throw fail("ml_invalid_response", 502);
  if (page.paging.total > 9950) throw fail("ml_range_too_large");
  const records = source.map(item => {
    if (kind === "claims") return claimRecord(item, account.seller_id);
    if (String(item.seller?.id) !== account.seller_id) throw fail("ml_invalid_response", 502);
    return orderRecord(item);
  });
  const timestamp = new Date().toISOString();
  const nextOffset = offset + source.length < page.paging.total ? offset + PAGE_SIZE : null;
  await withTransaction(async tx => {
    const current = await tx.execute({ sql: "SELECT generation FROM ml_connections WHERE user_id = ?", args: [user] });
    if (current.rows[0]?.generation !== account.generation) throw fail("ml_connection_changed", 409);
    if (kind === "orders") {
      const run = (await tx.execute({ sql: `SELECT run_id, next_offset FROM ml_sync_windows
        WHERE user_id = ? AND seller_id = ? AND from_date = ? AND to_date = ?`, args: [user, account.seller_id, dates.from, dates.to] })).rows[0];
      if (run?.run_id !== runId || run.next_offset === null || Number(run.next_offset) !== offset) throw fail("ml_sync_restart_required", 409);
    }
    const writes = records.map(record => {
      const created = new Date(record.dateCreated).toISOString();
      if (created < new Date(dates.start).toISOString() || created > new Date(dates.end).toISOString()) throw fail("ml_invalid_response", 502);
      return { sql: `INSERT INTO ml_records (user_id, seller_id, kind, resource_id, date_created, payload, synced_at, sync_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, seller_id, kind, resource_id)
        DO UPDATE SET date_created=excluded.date_created, payload=excluded.payload, synced_at=excluded.synced_at, sync_id=excluded.sync_id`,
      args: [user, account.seller_id, kind, record.id, created, JSON.stringify(record), timestamp, runId] };
    });
    if (writes.length) await tx.batch(writes);
    if (kind === "orders") {
      if (nextOffset === null) await tx.execute({ sql: `DELETE FROM ml_records WHERE user_id = ? AND seller_id = ? AND kind = 'orders'
        AND date_created >= ? AND date_created <= ? AND sync_id <> ?`,
        args: [user, account.seller_id, new Date(dates.start).toISOString(), new Date(dates.end).toISOString(), runId] });
      await tx.execute({ sql: `UPDATE ml_sync_windows SET next_offset = ?, completed_at = ?
        WHERE user_id = ? AND seller_id = ? AND from_date = ? AND to_date = ? AND run_id = ?`,
        args: [nextOffset, nextOffset === null ? timestamp : null, user, account.seller_id, dates.from, dates.to, runId] });
    }
  });
  return { count: records.length, total: page.paging.total, nextOffset };
}
async function list(user, input) {
  const dates = range(input);
  const { kind, offset } = paging(input);
  const account = await queryOne("SELECT seller_id FROM ml_connections WHERE user_id = ?", [user]);
  if (!account) throw fail("ml_not_connected", 409);
  const args = [user, account.seller_id, kind, new Date(dates.start).toISOString(), new Date(dates.end).toISOString()];
  const where = "user_id = ? AND seller_id = ? AND kind = ? AND date_created >= ? AND date_created <= ?";
  const rows = await queryAll(`SELECT payload, synced_at FROM ml_records WHERE ${where} ORDER BY date_created DESC, resource_id DESC LIMIT ? OFFSET ?`, [...args, PAGE_SIZE, offset]);
  const total = await queryOne(`SELECT COUNT(*) AS n FROM ml_records WHERE ${where}`, args);
  const summary = await queryOne(`SELECT
    COALESCE(SUM(CASE WHEN json_extract(payload, '$.currency') = 'BRL' AND json_extract(payload, '$.status') = 'paid'
      THEN json_extract(payload, '$.grossCents') ELSE 0 END), 0) AS paidCents,
    COALESCE(SUM(CASE WHEN json_extract(payload, '$.currency') = 'BRL'
      THEN json_extract(payload, '$.refundedCents') ELSE 0 END), 0) AS refundedCents
    FROM ml_records WHERE ${where}`, args);
  return { records: rows.map(row => ({ ...JSON.parse(row.payload), syncedAt: row.synced_at })), total: Number(total.n),
    summary: { paidCents: Number(summary.paidCents), refundedCents: Number(summary.refundedCents) },
    nextOffset: offset + PAGE_SIZE < Number(total.n) ? offset + PAGE_SIZE : null };
}
async function returnDetails(user, id) {
  if (!/^\d{1,24}$/.test(id)) throw fail("ml_invalid_resource");
  const account = await connection(user);
  const row = await queryOne("SELECT payload FROM ml_records WHERE user_id = ? AND seller_id = ? AND kind = 'claims' AND resource_id = ?",
    [user, account.seller_id, id]);
  if (!row || !JSON.parse(row.payload).hasReturn) throw fail("ml_resource_not_found", 404);
  const data = await remote(`/post-purchase/v2/claims/${id}/returns`, { headers: { Authorization: `Bearer ${account.accessToken}` } });
  // Expose operational fields only; addresses and buyer data stay off the client.
  return { id: String(data.id), status: data.status || null, lastUpdated: data.last_updated,
    shipments: (data.shipments || []).map(item => ({ id: String(item.shipment_id), status: item.status, trackingNumber: item.tracking_number })) };
}
async function disconnect(user) {
  await withTransaction(async tx => {
    for (const table of ["ml_auto_sync", "ml_connections", "ml_oauth_states", "ml_records", "ml_sync_windows", "ml_financials"]) {
      await tx.execute({ sql: `DELETE FROM ${table} WHERE user_id = ?`, args: [user] });
    }
  });
}
module.exports = { status, authorize, callback, sync, list, returnDetails, disconnect, range, connection, remote, orderRecord };
