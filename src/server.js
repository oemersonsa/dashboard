const { server, startServer, stopServer } = require("./server/index");
const { migrateLegacyUsers } = require("./db");
const usersRepo = require("./db/repositories/users.repo");

// Migração de dados legados
migrateLegacyUsers((username, record) => usersRepo.save(username, record));

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  });
}

module.exports = { server, startServer, stopServer };