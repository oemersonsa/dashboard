const { queryAll, execute } = require("../index");

async function listByUser(userId) {
  return queryAll(`
    SELECT platform_id, month, amount FROM returns WHERE user_id = ?
    ORDER BY month ASC, platform_id ASC
  `, [userId]);
}

async function deleteAllForUser(userId) {
  await execute("DELETE FROM returns WHERE user_id = ?", [userId]);
}

async function insertMany(userId, months, platforms, platformIds, timestamp) {
  for (const [month, monthData] of Object.entries(months || {})) {
    for (const platform of platforms) {
      const platformId = platformIds.get(platform.key);
      if (!platformId) continue;

      const amount = Number(monthData.returns?.[platform.key] || 0);
      if (amount <= 0) continue;

      await execute(`
        INSERT INTO returns
          (user_id, platform_id, month, amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [userId, platformId, month, amount, timestamp, timestamp]);
    }
  }
}

module.exports = { listByUser, deleteAllForUser, insertMany };