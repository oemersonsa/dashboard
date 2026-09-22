const http = require("http");
const config = require("../config/env");
const logger = require("../utils/logger");
const rateLimit = require("../middleware/rate-limit");
const sessions = require("../services/sessions.service");
const { handleRequest } = require("./router");
const { runMigrations } = require("../db");

const server = http.createServer(handleRequest);

rateLimit.startCleanup();

// Limpa sessões expiradas do banco a cada 1h
const sessionCleanup = setInterval(() => {
  sessions.cleanupExpired().catch((error) => {
    logger.error("Falha na limpeza de sessões", { error: error.message });
  });
}, 60 * 60_000);
sessionCleanup.unref?.();

async function startServer({ port = config.PORT, host = config.HOST } = {}) {
  // Roda migrations antes de subir
  await runMigrations();

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
    server.listen(port, host);
  });
}

function stopServer() {
  return new Promise((resolve, reject) => {
    if (!server.listening) return resolve();
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

module.exports = { server, startServer, stopServer };