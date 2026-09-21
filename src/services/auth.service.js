const crypto = require("crypto");
const usersRepo = require("../db/repositories/users.repo");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password, passwordHash) {
  const [scheme, salt, storedHash] = String(passwordHash || "").split(":");
  if (scheme !== "scrypt" || !salt || !storedHash) return false;
  const candidate = crypto.scryptSync(String(password || ""), salt, 64);
  const expected = Buffer.from(storedHash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

function getUser(username) {
  return usersRepo.get(username);
}

function saveUser(username, record) {
  usersRepo.save(username, record);
}

module.exports = { hashPassword, verifyPassword, getUser, saveUser };