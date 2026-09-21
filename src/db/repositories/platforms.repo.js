const { db } = require("../index");

function listByUser(userId) {
  return db.prepare(`
    SELECT id, platform_key, name, icon, color, icon_text, sort_order
    FROM platforms WHERE user_id = ?
    ORDER BY sort_order ASC, id ASC
  `).all(userId);
}

function deleteAllForUser(userId) {
  db.prepare("DELETE FROM platforms WHERE user_id = ?").run(userId);
}

function insertMany(userId, platforms, timestamp) {
  const stmt = db.prepare(`
    INSERT INTO platforms (user_id, platform_key, name, icon, color, icon_text, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const ids = new Map();
  (platforms || []).forEach((p, index) => {
    const result = stmt.run(
      userId, p.key, p.name, p.icon, p.color,
      p.iconText || "#ffffff", index, timestamp, timestamp
    );
    ids.set(p.key, result.lastInsertRowid);
  });
  return ids;
}

module.exports = { listByUser, deleteAllForUser, insertMany };