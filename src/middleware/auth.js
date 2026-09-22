const sessions = require("../services/sessions.service");

function extractToken(req, url = null) {
  const auth = String(req.headers["authorization"] || "");
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  if (url) {
    const tokenFromQuery = String(url.searchParams.get("sessionToken") || "").trim();
    if (tokenFromQuery) return tokenFromQuery;
  }
  return null;
}

async function validate(req, url) {
  const token = extractToken(req, url);
  return await sessions.validate(token);
}

module.exports = { extractToken, validate };