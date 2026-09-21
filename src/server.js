const { server, startServer, stopServer } = require("./server/index");

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  });
}

module.exports = { server, startServer, stopServer };