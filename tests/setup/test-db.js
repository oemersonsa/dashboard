import fs from "fs";
import path from "path";
import os from "os";

function forceRemoveDir(dir, maxRetries = 10) {
  if (!fs.existsSync(dir)) return;
  for (let i = 0; i < maxRetries; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      if (err.code !== "EPERM" && err.code !== "EBUSY" && err.code !== "ENOTEMPTY") throw err;
      const until = Date.now() + 200;
      while (Date.now() < until) {}
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

let currentTestDir = null;

export function resetTestDb() {
  // Cada chamada usa um diretório único para evitar conflito
  if (currentTestDir) forceRemoveDir(currentTestDir);
  const unique = `test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  currentTestDir = path.join(os.tmpdir(), "dashboard-vendas-test", unique);
  fs.mkdirSync(currentTestDir, { recursive: true });
  process.env.SQLITE_DATA_DIR = currentTestDir;
  process.env.SQLITE_DATABASE_PATH = path.join(currentTestDir, "test.sqlite");
  return currentTestDir;
}

export function cleanupTestDb() {
  if (currentTestDir) {
    forceRemoveDir(currentTestDir);
    currentTestDir = null;
  }
}