import { defineConfig } from "@playwright/test";

const PORT = 37171;
const HOST = "127.0.0.1";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  retries: 1,
  fullyParallel: false,
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.js",
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    launchOptions: {
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    }
  },
  webServer: {
    command: "node src/server.js",
    url: `http://${HOST}:${PORT}/api/state`,
    reuseExistingServer: false,     // ⬅️ SEMPRE sobe um novo
    timeout: 30000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      PORT: String(PORT),
      HOST,
      NODE_ENV: "test",
      SQLITE_DATA_DIR: "./.data-e2e",
      SQLITE_DATABASE_PATH: "./.data-e2e/e2e.sqlite"
    }
  }
});