const crypto = require("crypto");
const config = require("../config/env");
const { queryOne, queryAll, execute, withTransaction } = require("../db");
const marketplace = require("./mercado-livre.service");
const dashboard = require("./mercado-livre-dashboard.service");
const fail = (code, statusCode = 409) => { throw Object.assign(new Error(code), { code, statusCode }); };
const safeErrors = new Set(["ml_reconnect_required", "ml_invalid_client", "ml_credentials_unavailable", "ml_permission_denied",
  "ml_rate_limited", "ml_unavailable", "ml_range_too_large", "ml_invalid_response", "ml_connection_busy",
  "ml_connection_changed", "ml_sync_restart_required", "ml_sync_incomplete", "ml_platform_required", "ml_auto_sync_changed",
  "ml_not_configured", "ml_not_connected", "ml_offline_access_required", "ml_invalid_oauth_request"]);

function dateRange(now = new Date()) {
  const to = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const from = new Date(Date.parse(`${to}T12:00:00Z`) - 30 * 86400000).toISOString().slice(0, 10);
  return { from, to, kind: "orders" };
}
async function status(user) {
  const row = await queryOne("SELECT * FROM ml_auto_sync WHERE user_id = ?", [user]);
  const account = await queryOne("SELECT seller_id FROM ml_connections WHERE user_id = ?", [user]);
  const enabled = Boolean(row?.enabled && row.seller_id === account?.seller_id);
  return { schedulerConfigured: config.CRON_SECRET.length >= 16, enabled,
    platformKey: row?.platform_key || "", lastAttemptAt: row?.last_attempt_at || null, lastSuccessAt: row?.last_success_at || null,
    lastError: row?.last_error || null, pending: enabled && Boolean(row?.from_date), running: enabled && Number(row?.lock_until || 0) > Date.now(),
    lastChangedDays: Number(row?.last_changed_days || 0) };
}
async function configure(user, input) {
  if (typeof input?.enabled !== "boolean") fail("ml_invalid_auto_sync_settings", 400);
  if (input.enabled && config.CRON_SECRET.length < 16) fail("ml_scheduler_not_configured", 503);
  await withTransaction(async tx => {
    const account = (await tx.execute({ sql: "SELECT seller_id FROM ml_connections WHERE user_id = ?", args: [user] })).rows[0];
    if (!account) fail("ml_not_connected");
    if (!input.enabled) {
      await tx.execute({ sql: `UPDATE ml_auto_sync SET enabled=0, lock_id=NULL, lock_until=0,
        from_date=NULL, to_date=NULL, next_offset=0, last_error=NULL WHERE user_id=?`,
        args: [user] });
      return;
    }
    const platform = (await tx.execute({ sql: "SELECT platform_key FROM platforms WHERE user_id = ? AND platform_key = ? AND archived = 0",
      args: [user, String(input.platformKey || "")] })).rows[0];
    if (!platform) fail("ml_platform_required", 400);
    await tx.execute({ sql: `INSERT INTO ml_auto_sync (user_id, seller_id, platform_key, enabled)
      VALUES (?, ?, ?, 1) ON CONFLICT(user_id) DO UPDATE SET seller_id=excluded.seller_id,
      platform_key=excluded.platform_key, enabled=1, lock_id=NULL, lock_until=0,
      from_date=NULL, to_date=NULL, next_offset=0, last_error=NULL, last_success_at=NULL, last_to_date=NULL`,
      args: [user, account.seller_id, platform.platform_key] });
  });
  return status(user);
}
async function runUser(user, { deadline = Date.now() + 40000, force = false } = {}) {
  const lockId = crypto.randomUUID();
  const row = await withTransaction(async tx => {
    const settings = (await tx.execute({ sql: `SELECT a.* FROM ml_auto_sync a JOIN ml_connections c ON c.user_id=a.user_id
      AND c.seller_id=a.seller_id WHERE a.user_id=? AND a.enabled=1 AND a.lock_until < ?`, args: [user, Date.now()] })).rows[0];
    if (!settings) return null;
    const dates = dateRange();
    if (!force && !settings.from_date && settings.last_to_date === dates.to) return null;
    await tx.execute({ sql: "UPDATE ml_auto_sync SET lock_id=?, lock_until=?, last_attempt_at=?, last_error=NULL WHERE user_id=?",
      args: [lockId, Date.now() + 90000, new Date().toISOString(), user] });
    return settings;
  });
  if (!row) return { skipped: true };
  try {
    const dates = row.from_date ? { from: row.from_date, to: row.to_date, kind: "orders" } : dateRange();
    let offset = row.from_date ? Number(row.next_offset) : 0;
    await execute("UPDATE ml_auto_sync SET from_date=?, to_date=?, next_offset=? WHERE user_id=? AND lock_id=?",
      [dates.from, dates.to, offset, user, lockId]);
    while (Date.now() + 15000 < deadline) {
      const active = await queryOne("SELECT enabled, lock_id FROM ml_auto_sync WHERE user_id=?", [user]);
      if (!active?.enabled || active.lock_id !== lockId) fail("ml_auto_sync_changed");
      const result = await marketplace.sync(user, { ...dates, offset });
      if (result.nextOffset === null) {
        const applied = await dashboard.applyAutomatic(user, { ...dates, platformKey: row.platform_key }, { lockId, sellerId: row.seller_id });
        return { completed: true, changedDays: applied.changedDays, to: dates.to };
      }
      offset = result.nextOffset;
      await execute("UPDATE ml_auto_sync SET next_offset=? WHERE user_id=? AND lock_id=?", [offset, user, lockId]);
    }
    return { pending: true };
  } catch (error) {
    const code = safeErrors.has(error.code) ? error.code : "ml_auto_sync_failed";
    // Manual syncs may replace a window. Restart safely instead of applying a partial snapshot.
    await execute(`UPDATE ml_auto_sync SET last_error=?, next_offset=CASE WHEN ? IN ('ml_sync_restart_required','ml_sync_incomplete')
      THEN 0 ELSE next_offset END WHERE user_id=? AND lock_id=?`, [code, error.code || "", user, lockId]);
    return { failed: true, error: code };
  } finally {
    await execute("UPDATE ml_auto_sync SET lock_id=NULL, lock_until=0 WHERE user_id=? AND lock_id=?", [user, lockId]);
  }
}
async function runDaily() {
  const deadline = Date.now() + 40000;
  const accounts = await queryAll(`SELECT a.user_id FROM ml_auto_sync a JOIN ml_connections c ON c.user_id=a.user_id
    AND c.seller_id=a.seller_id WHERE a.enabled=1 ORDER BY COALESCE(a.last_attempt_at, '')`);
  const result = { completed: 0, failed: 0, pending: 0, skipped: 0, deferred: 0 };
  for (const account of accounts) {
    if (Date.now() >= deadline) { result.deferred++; continue; }
    let outcome = await runUser(account.user_id, { deadline });
    if (outcome.completed && outcome.to < dateRange().to && Date.now() + 15000 < deadline) {
      outcome = await runUser(account.user_id, { deadline });
    }
    result[outcome.completed ? "completed" : outcome.failed ? "failed" : outcome.pending ? "pending" : "skipped"]++;
  }
  return result;
}
module.exports = { status, configure, runUser, runDaily, dateRange };
