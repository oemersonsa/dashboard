const { queryAll, execute } = require("../index");

async function listByUser(userId) {
  return queryAll(`
    SELECT platform_id, month, date, amount, orders_count
    FROM sales WHERE user_id = ?
    ORDER BY month ASC, date ASC, platform_id ASC
  `, [userId]);
}

async function deleteAllForUser(userId) {
  await execute("DELETE FROM sales WHERE user_id = ?", [userId]);
}

async function insertMany(userId, months, platforms, platformIds, timestamp) {
  for (const [month, monthData] of Object.entries(months || {})) {
    for (const day of monthData.days || []) {
      for (const platform of platforms) {
        const platformId = platformIds.get(platform.key);
        if (!platformId || !day.d) continue;

        const amount = Number(day[platform.key] || 0);
        const orders = Math.max(0, Math.round(Number(day[`orders_${platform.key}`] || 0)));
        if (amount <= 0 && orders <= 0) continue;

        await execute(`
          INSERT INTO sales
            (user_id, platform_id, month, date, amount, orders_count, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [userId, platformId, month, day.d, amount, orders, timestamp, timestamp]);
      }
    }
  }
}

module.exports = { listByUser, deleteAllForUser, insertMany };