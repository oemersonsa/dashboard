import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.js"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    // ⬇️ Cada arquivo roda em processo próprio
    pool: "forks",
    poolOptions: {
      forks: { singleFork: false }
    },
    fileParallelism: false,   // arquivos rodam em sequência, mas em processos diferentes
    coverage: { /* ... */ }
  }
});