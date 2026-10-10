const crypto = require("crypto");
const { promisify } = require("util");
const scrypt = promisify(crypto.scrypt);
const usersRepo = require("../db/repositories/users.repo");

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = (await scrypt(String(password || ""), salt, 64)).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

async function verifyPassword(password, passwordHash) {
  const [scheme, salt, storedHash] = String(passwordHash || "").split(":");
  if (scheme !== "scrypt" || !salt || !storedHash) return false;
  const candidate = await scrypt(String(password || ""), salt, 64);
  const expected = Buffer.from(storedHash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

async function getUser(username) {
  return usersRepo.get(username);
}

async function saveUser(username, record) {
  return usersRepo.save(username, record);
}

module.exports = { hashPassword, verifyPassword, getUser, saveUser };