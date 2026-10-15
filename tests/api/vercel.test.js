import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { resetTestDb, cleanupTestDb } from "../setup/test-db.js";

const require = createRequire(import.meta.url);
let server;
let origin;

beforeAll(async () => {
  resetTestDb();
  // Mesmo preparo feito no build do deploy, em um banco isolado.
  await require("../../src/db").runMigrations();
  const handler = require("../../api/index.js");
  server = createServer(async (req, res) => {
    // Simula o helper de JSON da Vercel, que consome o stream antes do handler.
    if (req.headers["content-type"]?.includes("application/json")) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      if (chunks.length) req.body = JSON.parse(Buffer.concat(chunks).toString());
    }
    await handler(req, res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await cleanupTestDb();
});

describe("Vercel handler", () => {
  it("responde aos healthchecks com o caminho original", async () => {
    for (const route of ["/health", "/health/database"]) {
      const response = await fetch(origin + route);
      expect(response.status).toBe(200);
      expect((await response.json()).status).toBe("ok");
    }
  });

  it("cadastra, autentica e salva dados com JSON previamente lido", async () => {
    const credentials = { username: "vercel_test", password: "senha-segura-vercel-1234" };
    const headers = { "Content-Type": "application/json" };
    const register = await fetch(origin + "/api/auth/register", {
      method: "POST", headers, body: JSON.stringify(credentials)
    });
    expect(register.status).toBe(200);
    const login = await fetch(origin + "/api/auth/login", {
      method: "POST", headers, body: JSON.stringify(credentials)
    });
    expect(login.status).toBe(200);
    const { sessionToken } = await login.json();
    expect(sessionToken).toBeTruthy();
    const authenticatedHeaders = { ...headers, Authorization: `Bearer ${sessionToken}` };
    const saved = await fetch(origin + "/api/platforms", {
      method: "POST", headers: authenticatedHeaders,
      body: JSON.stringify({ platforms: [{ key: "v1", name: "Vercel", icon: "VC", color: "#123456", iconText: "#ffffff" }] })
    });
    expect(saved.status).toBe(200);
    const loaded = await fetch(origin + "/api/platforms", { headers: authenticatedHeaders });
    expect(loaded.status).toBe(200);
    expect(JSON.stringify(await loaded.json())).toContain("Vercel");
    const unauthenticated = await fetch(origin + "/api/state");
    expect(unauthenticated.status).toBe(401);
  });
});
