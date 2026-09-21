import fs from "fs";
import path from "path";

export default async function globalSetup() {
  const dir = path.resolve(process.cwd(), ".data-e2e");
  if (fs.existsSync(dir)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  fs.mkdirSync(dir, { recursive: true });
  console.log("[global-setup] .data-e2e resetado");
}