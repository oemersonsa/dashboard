const { queryAll, queryOne, execute } = require("../index");

async function listByUser(userId) {
  return queryAll(`
    SELECT month, target FROM goals WHERE user_id = ?
    ORDER BY month ASC
  `, [userId]);
}

async function getByMonth(userId, month) {
  return queryOne(`
    SELECT month, target FROM goals WHERE user_id = ? AND month = ?
  `, [userId, month]);
}

async function deleteAllForUser(userId) {
  await execute("DELETE FROM goals WHERE user_id = ?", [userId]);
}

async function upsertMany(userId, goals, timestamp) {
  for (const [month, value] of Object.entries(goals || {})) {
    const target = Number(value?.target ?? value ?? 0);
    if (!Number.isFinite(target) || target <= 0) continue;

    await execute(`
      INSERT INTO goals (user_id, month, target, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, month) DO UPDATE SET
        target = excluded.target,
        updated_at = excluded.updated_at
    `, [userId, month, target, timestamp, timestamp]);
  }
}

module.exports = { listByUser, getByMonth, deleteAllForUser, upsertMany };