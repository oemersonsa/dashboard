import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let previousEnvironment;

export function resetTestDb() {
  previousEnvironment = {
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN
  };
  process.env.TURSO_DATABASE_URL = "file::memory:";
  process.env.TURSO_AUTH_TOKEN = "";
}

export async function cleanupTestDb() {
  require("../../src/db/index.js").client.close();
  for (const [key, value] of Object.entries(previousEnvironment || {})) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  previousEnvironment = undefined;
}
