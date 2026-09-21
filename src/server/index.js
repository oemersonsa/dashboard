const http = require("http");
const config = require("../config/env");
const logger = require("../utils/logger");
const rateLimit = require("../middleware/rate-limit");
const sessions = require("../services/sessions.service");
const { handleRequest } = require("./router");
const { closeDb } = require("../db");

const server = http.createServer(handleRequest);

// Timers de limpeza
rateLimit.startCleanup();
const sessionCleanup = setInterval(() => sessions.cleanupExpired(), 60 * 60_000);
sessionCleanup.unref?.();

function startServer({ port = config.PORT, host = config.HOST } = {}) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      const actualHost = host === "0.0.0.0" ? "127.0.0.1" : host;
      const url = `http://${actualHost}:${actualPort}`;
      logger.info("Server started", { origin: url });
      resolve({ server, port: actualPort, host: actualHost, url });
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host, "0.0.0.0");
  });
}

function stopServer() {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      closeDb();
      return resolve();
    }
    server.close((error) => {
      closeDb();
      if (error) reject(error);
      else resolve();
    });
  });
}

module.exports = { server, startServer, stopServer };