import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), ".data-e2e");

function forceRemoveDir(dir, maxRetries = 10) {
  if (!fs.existsSync(dir)) return;
  for (let i = 0; i < maxRetries; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      if (err.code !== "EPERM" && err.code !== "EBUSY" && err.code !== "ENOTEMPTY") throw err;
      const until = Date.now() + 200;
      while (Date.now() < until) { /* spin */ }
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

export function resetE2eDb() {
  forceRemoveDir(DATA_DIR);
  fs.mkdirSync(DATA_DIR, { recursive: true });
}