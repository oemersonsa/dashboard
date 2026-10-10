const { server, startServer, stopServer } = require("./server/index");

if (require.main === module) {
  const config = require("./config/env");
  const { client } = require("./db");
  let shutdownPromise;

  function shutdown(exitCode) {
    if (shutdownPromise) return shutdownPromise;
    process.exitCode = exitCode;
    shutdownPromise = (async () => {
      try {
        await stopServer();
      } finally {
        // Deixe o Node liberar os recursos nativos antes de encerrar o processo.
        await client.close();
      }
    })();
    return shutdownPromise;
  }

  process.once("SIGINT", () => {
    shutdown(0).catch(error => { console.error("Falha ao encerrar o servidor:", error.message); process.exitCode = 1; });
  });
  process.once("SIGTERM", () => {
    shutdown(0).catch(error => { console.error("Falha ao encerrar o servidor:", error.message); process.exitCode = 1; });
  });

  startServer().catch(async (error) => {
    if (error.code === "EADDRINUSE") {
      const browserHost = ["0.0.0.0", "::"].includes(config.HOST) ? "localhost" : config.HOST;
      const host = browserHost.includes(":") ? `[${browserHost}]` : browserHost;
      console.error(`A porta ${config.PORT} já está em uso. Se o Kanri já estiver aberto, acesse http://${host}:${config.PORT}. Para reiniciar, encerre o servidor anterior com Ctrl+C no terminal onde ele está rodando.`);
    } else {
      console.error("Falha ao iniciar o servidor:", error.message);
    }
    try {
      await shutdown(1);
    } catch (closeError) {
      console.error("Falha ao liberar os recursos do servidor:", closeError.message);
    }
  });
}

module.exports = { server, startServer, stopServer };
