import { describe, it, expect } from "vitest";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

describe("inicialização do servidor", () => {
  it("explica o conflito de porta e encerra sem falha nativa", async () => {
    const occupiedPort = createServer();
    occupiedPort.listen(0, "127.0.0.1");
    await once(occupiedPort, "listening");
    const port = occupiedPort.address().port;
    try {
      const child = spawn(process.execPath, [path.resolve("src/server.js")], {
        cwd: path.resolve("."),
        env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", TURSO_DATABASE_URL: "file::memory:", TURSO_AUTH_TOKEN: "", NODE_ENV: "test" },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
      let output = "";
      child.stdout.on("data", chunk => { output += chunk; });
      child.stderr.on("data", chunk => { output += chunk; });
      const timeout = setTimeout(() => child.kill(), 10000);
      let code, signal;
      try {
        [code, signal] = await once(child, "close");
      } finally {
        clearTimeout(timeout);
      }
      expect(signal).toBeNull();
      expect(code).toBe(1);
      expect(output).toContain(`A porta ${port} já está em uso`);
      expect(output).toContain(`http://127.0.0.1:${port}`);
      expect(output).toContain("Ctrl+C");
      expect(output).not.toMatch(/Assertion failed|UV_HANDLE_CLOSING/);
    } finally {
      await new Promise(resolve => occupiedPort.close(resolve));
    }
  }, 15000);
});
