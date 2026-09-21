const { URL } = require("url");
const { setCorsHeaders } = require("../middleware/cors");
const rateLimit = require("../middleware/rate-limit");
const authMiddleware = require("../middleware/auth");
const { Errors } = require("../utils/errors");
const logger = require("../utils/logger");
const staticServer = require("./static");
const { APP_ORIGIN } = require("../config/env");

const authRoutes = require("../routes/auth.routes");
const stateRoutes = require("../routes/state.routes");
const platformsRoutes = require("../routes/platforms.routes");
const salesRoutes = require("../routes/sales.routes");
const returnsRoutes = require("../routes/returns.routes");

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

async function handleRequest(req, res) {
  const ip = rateLimit.getClientIp(req);
  const url = new URL(req.url, APP_ORIGIN);

  setCorsHeaders(res, req);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  logger.info("Request", { method: req.method, path: url.pathname, ip });

  if (url.pathname.startsWith("/api/") && !rateLimit.check(ip)) {
    return sendJson(res, 429, { error: "too_many_requests" });
  }

  try {
    // ─── Public auth routes ─────────────────────────────────────────────
    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      return await authRoutes.register(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      return await authRoutes.login(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/auth/migrate-local") {
      return await authRoutes.migrateLocal(req, res);
    }
    if (req.method === "GET" && url.pathname === "/api/auth/session") {
      return await authRoutes.session(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      return await authRoutes.logout(req, res);
    }

    // ─── Protected routes ──────────────────────────────────────────────
    const authenticatedUser = authMiddleware.validate(req, url);

    if (req.method === "POST" && url.pathname === "/api/auth/change-password") {
      if (!authenticatedUser) return sendJson(res, 401, { error: "unauthorized" });
      return await authRoutes.changePassword(req, res, authenticatedUser);
    }

    if (url.pathname.startsWith("/api/")) {
      if (!authenticatedUser) return sendJson(res, 401, { error: "unauthorized" });

      if (req.method === "GET" && url.pathname === "/api/state") {
        return await stateRoutes.getState(req, res, authenticatedUser);
      }
      if (req.method === "POST" && url.pathname === "/api/state") {
        return await stateRoutes.saveState(req, res, authenticatedUser);
      }
      if (req.method === "GET" && url.pathname === "/api/platforms") {
        return await platformsRoutes.list(req, res, authenticatedUser);
      }
      if (req.method === "POST" && url.pathname === "/api/platforms") {
        return await platformsRoutes.save(req, res, authenticatedUser);
      }
      if (req.method === "GET" && url.pathname === "/api/sales") {
        return await salesRoutes.list(req, res, authenticatedUser);
      }
      if (req.method === "POST" && url.pathname === "/api/sales") {
        return await salesRoutes.save(req, res, authenticatedUser);
      }
      if (req.method === "GET" && url.pathname === "/api/returns") {
        return await returnsRoutes.list(req, res, authenticatedUser);
      }
      if (req.method === "POST" && url.pathname === "/api/returns") {
        return await returnsRoutes.save(req, res, authenticatedUser);
      }
      const dashboardMatch = url.pathname.match(/^\/api\/dashboard\/(.+)$/);
      if (req.method === "GET" && dashboardMatch) {
        return await salesRoutes.dashboard(req, res, authenticatedUser, dashboardMatch[1]);
      }
    }

    // ─── Static files ──────────────────────────────────────────────────
    if (req.method === "GET") {
      return staticServer.serve(req, res, url);
    }

    sendText(res, 404, "Not found");
  } catch (error) {
    const statusCode = error.statusCode || 500;
    logger.error("Unhandled error", { message: error.message, path: url.pathname });
    const safeMessage = statusCode === 500 ? "internal_server_error" : error.code || error.message;
    sendJson(res, statusCode, { error: safeMessage });
  }
}

if (req.method === "GET" && url.pathname === "/health") {
  return sendJson(res, 200, { status: "ok" });
}

module.exports = { handleRequest };