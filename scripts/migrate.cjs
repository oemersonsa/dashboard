const { client, runMigrations } = require("../src/db");

(async () => {
  try {
    if (process.env.VERCEL && !/^(libsql|https):\/\//.test(process.env.TURSO_DATABASE_URL || "")) {
      throw new Error("Na Vercel, configure TURSO_DATABASE_URL com a URL de um banco remoto.");
    }
    await runMigrations();
    console.log("Banco atualizado.");
  } catch (error) {
    console.error("Falha nas migrations:", error.message);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
})();
