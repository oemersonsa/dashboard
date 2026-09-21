const { queryAll, execute } = require("../index");

async function listByUser(userId) {
  return queryAll(`
    SELECT id, platform_key, name, icon, color, icon_text, sort_order
    FROM platforms WHERE user_id = ?
    ORDER BY sort_order ASC, id ASC
  `, [userId]);
}

async function deleteAllForUser(userId) {
  await execute("DELETE FROM platforms WHERE user_id = ?", [userId]);
}

async function insertMany(userId, platforms, timestamp) {
  const ids = new Map();
  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i];
    const result = await execute(`
      INSERT INTO platforms
        (user_id, platform_key, name, icon, color, icon_text, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId, p.key, p.name, p.icon, p.color,
      p.iconText || "#ffffff", i, timestamp, timestamp
    ]);
    ids.set(p.key, Number(result.lastInsertRowid));
  }
  return ids;
}

module.exports = { listByUser, deleteAllForUser, insertMany };