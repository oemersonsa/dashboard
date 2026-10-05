import { defineConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const testDirectory = path.resolve(".data-e2e");
fs.mkdirSync(testDirectory, { recursive: true });
const testDatabase = pathToFileURL(path.join(testDirectory, `e2e-${process.pid}-${Date.now()}.sqlite`)).href;

const PORT = 37171;
const HOST = "127.0.0.1";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  retries: 1,
  fullyParallel: false,
  workers: 1,
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
    stdout: "ignore",
    stderr: "pipe",
    env: {
      PORT: String(PORT),
      HOST,
      NODE_ENV: "test",
      TURSO_DATABASE_URL: testDatabase,
      TURSO_AUTH_TOKEN: "",
    }
  }
});
