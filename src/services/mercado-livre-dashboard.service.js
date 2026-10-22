const crypto = require("crypto");
const { withTransaction } = require("../db");
const { range, accountFor } = require("./mercado-livre.service");
const MONTHS = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const fail = (code, statusCode = 409) => { throw Object.assign(new Error(code), { code, statusCode }); };

// Build and verify the same snapshot inside the apply transaction. Both manual
// edits and marketplace updates invalidate a preview before it can overwrite data.
async function build(tx, user, input) {
  const dates = range(input);
  if (Number(dates.from.slice(0, 4)) < 2000 || Number(dates.to.slice(0, 4)) > 2100) fail("ml_invalid_date_range", 400);
  if (input.kind !== "orders") fail("ml_orders_required", 400);
  const account = await accountFor(user, input.sellerId, tx);
  if (!account) fail("ml_not_connected");
  const platform = (await tx.execute({ sql: "SELECT id, name, platform_key FROM platforms WHERE user_id = ? AND platform_key = ? AND archived = 0",
    args: [user, String(input.platformKey || "")] })).rows[0];
  if (!platform) fail("ml_platform_required", 400);
  const occupied = (await tx.execute({ sql: "SELECT seller_id FROM ml_auto_sync WHERE user_id=? AND platform_key=? AND seller_id<>?", args: [user, platform.platform_key, account.seller_id] })).rows[0];
  if (occupied) fail("ml_platform_in_use");
  const windows = (await tx.execute({ sql: `SELECT run_id, completed_at, metrics_version, from_date, to_date FROM ml_sync_windows
    WHERE user_id = ? AND seller_id = ? AND from_date <= ? AND to_date >= ? ORDER BY from_date`,
    args: [user, account.seller_id, dates.to, dates.from] })).rows;
  let coveredUntil = dates.from;
  for (const window of windows) {
    if (window.from_date > coveredUntil || !window.completed_at || Number(window.metrics_version) < 2) fail("ml_sync_incomplete");
    coveredUntil = new Date(Date.parse(window.to_date) + 86400000).toISOString().slice(0, 10);
  }
  if (coveredUntil <= dates.to) fail("ml_sync_incomplete");
  const records = (await tx.execute({ sql: `SELECT resource_id, payload FROM ml_records WHERE user_id = ? AND seller_id = ?
    AND kind = 'orders' AND date_created >= ? AND date_created <= ? ORDER BY resource_id`,
    args: [user, account.seller_id, new Date(dates.start).toISOString(), new Date(dates.end).toISOString()] })).rows;
  const days = new Map();
  for (let date = Date.parse(`${dates.from}T12:00:00Z`); date <= Date.parse(`${dates.to}T12:00:00Z`); date += 86400000) {
    const iso = new Date(date).toISOString().slice(0, 10);
    const [year, month, day] = iso.split("-");
    days.set(iso, { date: iso, month: `${year}-${MONTHS[Number(month) - 1]}`, day: `${day}/${month}`, amountCents: 0, refundCents: 0, orders: 0 });
  }
  let excluded = 0;
  let refundEstimates = 0;
  for (const row of records) {
    const record = JSON.parse(row.payload);
    if (!["paid", "cancelled"].includes(record.status) || record.currency !== "BRL" || record.cancellationCode === "pack_splitted") { excluded++; continue; }
    const iso = new Date(Date.parse(record.dateCreated) - 3 * 3600000).toISOString().slice(0, 10);
    const day = days.get(iso);
    if (!day || !Number.isSafeInteger(record.grossCents) || record.grossCents < 0) fail("ml_invalid_response", 502);
    day.amountCents += record.grossCents;
    if (record.status === "cancelled") day.refundCents += record.grossCents;
    else if (record.refundedCents > 0) {
      if (!Number.isSafeInteger(record.refundedCents)) fail("ml_invalid_response", 502);
      // Payments can include shipping. Never deduct more than this order's products.
      day.refundCents += Math.min(record.grossCents, record.refundedCents);
      refundEstimates++;
    }
    day.orders++;
  }
  const settings = (await tx.execute({ sql: "SELECT updated_at FROM app_settings WHERE user_id = ?", args: [user] })).rows[0];
  const version = settings?.updated_at || "";
  const rows = [];
  const months = [...new Set([...days.values()].map(day => day.month))];
  const existing = (await tx.execute({ sql: `SELECT month, date, amount, orders_count, refund_amount FROM sales
    WHERE user_id = ? AND platform_id = ? AND month IN (${months.map(() => "?").join(",")})`,
    args: [user, platform.id, ...months] })).rows;
  const byDate = new Map(existing.map(row => [`${row.month}:${row.date}`, row]));
  for (const day of days.values()) {
    const previous = byDate.get(`${day.month}:${day.day}`);
    rows.push({ ...day, previousCents: Math.round(Number(previous?.amount || 0) * 100), previousOrders: Number(previous?.orders_count || 0), previousRefundCents: Math.round(Number(previous?.refund_amount || 0) * 100) });
  }
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify({ user, seller: account.seller_id, platform: platform.platform_key,
    dates, version, runs: windows.map(window => window.run_id), records, rows })).digest("hex");
  return { platform, version, fingerprint, from: dates.from, to: dates.to, syncedAt: windows.map(window => window.completed_at).sort()[0],
    days: rows, months: [...new Set(rows.map(day => day.month))], excluded, refundEstimates,
    refundCents: rows.reduce((sum, day) => sum + day.refundCents, 0),
    netCents: rows.reduce((sum, day) => sum + day.amountCents - day.refundCents, 0),
    grossCents: rows.reduce((sum, day) => sum + day.amountCents, 0), orders: rows.reduce((sum, day) => sum + day.orders, 0),
    changedDays: rows.filter(day => changed(day)).length,
    replacedDays: rows.filter(day => (day.previousCents || day.previousOrders || day.previousRefundCents) && changed(day)).length };
}
const changed = day => day.amountCents !== day.previousCents || day.orders !== day.previousOrders || day.refundCents !== day.previousRefundCents;
function publicPreview(data) {
  return { ...data, platform: { key: data.platform.platform_key, name: data.platform.name }, version: undefined };
}
async function preview(user, input) {
  return withTransaction(async tx => publicPreview(await build(tx, user, input)));
}
async function apply(user, input) {
  if (typeof input?.fingerprint !== "string") fail("ml_preview_required", 400);
  return withTransaction(async tx => {
    const data = await build(tx, user, input);
    if (input.fingerprint !== data.fingerprint) fail("ml_preview_expired");
    return write(tx, user, data);
  });
}
async function applyAutomatic(user, input, { lockId, sellerId }) {
  return withTransaction(async tx => {
    const job = (await tx.execute({ sql: `SELECT a.* FROM ml_auto_sync a JOIN ml_connections c
      ON c.user_id=a.user_id AND c.seller_id=a.seller_id WHERE a.user_id=? AND a.enabled=1
      AND a.lock_id=? AND a.lock_until > ? AND a.seller_id=? AND a.platform_key=?`,
      args: [user, lockId, Date.now(), sellerId, input.platformKey] })).rows[0];
    if (!job) fail("ml_auto_sync_changed");
    const data = await build(tx, user, input);
    const result = await write(tx, user, data);
    await tx.execute({ sql: `UPDATE ml_auto_sync SET last_success_at=?, last_to_date=?, last_error=NULL,
      last_changed_days=?, from_date=NULL, to_date=NULL, next_offset=0 WHERE user_id=? AND lock_id=?`,
      args: [new Date().toISOString(), input.to, result.changedDays, user, lockId] });
    return result;
  });
}
async function write(tx, user, data) {
    if (!data.changedDays) return { ok: true, changedDays: 0, months: data.months };
    const timestamp = new Date(Math.max(Date.now(), (Date.parse(data.version) || 0) + 1)).toISOString();
    const writes = [];
    for (const day of data.days) {
      if (!changed(day)) continue;
      if (!day.orders && !day.amountCents && !day.refundCents) {
        writes.push({ sql: "DELETE FROM sales WHERE user_id = ? AND platform_id = ? AND month = ? AND date = ?",
          args: [user, data.platform.id, day.month, day.day] });
      } else {
        writes.push({ sql: "INSERT OR IGNORE INTO periods (user_id, month) VALUES (?, ?)", args: [user, day.month] });
        writes.push({ sql: "INSERT OR IGNORE INTO logged_days (user_id, month, date) VALUES (?, ?, ?)", args: [user, day.month, day.day] });
        writes.push({ sql: `INSERT INTO sales (user_id, platform_id, month, date, amount, orders_count, refund_amount, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, platform_id, month, date)
          DO UPDATE SET amount=excluded.amount, orders_count=excluded.orders_count, refund_amount=excluded.refund_amount, updated_at=excluded.updated_at`,
          args: [user, data.platform.id, day.month, day.day, day.amountCents / 100, day.orders, day.refundCents / 100, timestamp, timestamp] });
      }
    }
    writes.push({ sql: `INSERT INTO app_settings (user_id, updated_at) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET updated_at=excluded.updated_at`, args: [user, timestamp] });
    await tx.batch(writes);
    return { ok: true, changedDays: data.changedDays, months: data.months, updatedAt: timestamp };
}
module.exports = { preview, apply, applyAutomatic };
