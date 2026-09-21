const { db } = require("../index");

function listByUser(userId) {
  return db.prepare(`
    SELECT platform_id, month, amount FROM returns WHERE user_id = ?
    ORDER BY month ASC, platform_id ASC
  `).all(userId);
}

function deleteAllForUser(userId) {
  db.prepare("DELETE FROM returns WHERE user_id = ?").run(userId);
}

function insertMany(userId, months, platforms, platformIds, timestamp) {
  const stmt = db.prepare(`
    INSERT INTO returns (user_id, platform_id, month, amount, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  Object.entries(months || {}).forEach(([month, monthData]) => {
    platforms.forEach((platform) => {
      const platformId = platformIds.get(platform.key);
      if (!platformId) return;
      const amount = Number(monthData.returns?.[platform.key] || 0);
      if (amount <= 0) return;
      stmt.run(userId, platformId, month, amount, timestamp, timestamp);
    });
  });
}

module.exports = { listByUser, deleteAllForUser, insertMany };