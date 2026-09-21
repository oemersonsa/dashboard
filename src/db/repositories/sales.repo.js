const { db } = require("../index");

function listByUser(userId) {
  return db.prepare(`
    SELECT platform_id, month, date, amount, orders_count
    FROM sales WHERE user_id = ?
    ORDER BY month ASC, date ASC, platform_id ASC
  `).all(userId);
}

function deleteAllForUser(userId) {
  db.prepare("DELETE FROM sales WHERE user_id = ?").run(userId);
}

function insertMany(userId, months, platforms, platformIds, timestamp) {
  const stmt = db.prepare(`
    INSERT INTO sales (user_id, platform_id, month, date, amount, orders_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  Object.entries(months || {}).forEach(([month, monthData]) => {
    (monthData.days || []).forEach((day) => {
      platforms.forEach((platform) => {
        const platformId = platformIds.get(platform.key);
        if (!platformId || !day.d) return;
        const amount = Number(day[platform.key] || 0);
        const orders = Math.max(0, Math.round(Number(day[`orders_${platform.key}`] || 0)));
        if (amount <= 0 && orders <= 0) return;
        stmt.run(userId, platformId, month, day.d, amount, orders, timestamp, timestamp);
      });
    });
  });
}

module.exports = { listByUser, deleteAllForUser, insertMany };