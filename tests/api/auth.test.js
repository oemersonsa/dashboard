import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetTestDb, cleanupTestDb } from "../setup/test-db.js";

let serverInfo;

beforeAll(async () => {
  resetTestDb();
  await new Promise((r) => setTimeout(r, 100));
  const { startServer } = await import("../../src/server/index.js");
  serverInfo = await startServer({ port: 0, host: "127.0.0.1" });
});

afterAll(async () => {
  const { stopServer } = await import("../../src/server/index.js");
  await stopServer();
  await new Promise((r) => setTimeout(r, 200));
  cleanupTestDb();
});

async function request(path, opts = {}) {
  const res = await fetch(`${serverInfo.url}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) }
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

let counter = 0;
const uniqueUser = () => `user_${Date.now()}_${counter++}`;

describe("API - Auth", () => {
  it("register cria novo usuário", async () => {
    const u = uniqueUser();
    const r = await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: u, password: "1234" })
    });
    expect(r.status).toBe(200);
    expect(r.data.sessionToken).toBeTruthy();
  });

  it("register rejeita usuário duplicado", async () => {
    const u = uniqueUser();
    await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: u, password: "1234" })
    });
    const r = await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: u, password: "5678" })
    });
    expect(r.status).toBe(409);
    expect(r.data.error).toBe("user_already_exists");
  });

  it("register rejeita senha curta", async () => {
    const r = await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: uniqueUser(), password: "1" })
    });
    expect(r.status).toBe(400);
    expect(r.data.error).toBe("password_too_short");
  });

  it("login com credenciais válidas", async () => {
    const u = uniqueUser();
    await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: u, password: "1234" })
    });
    const r = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: u, password: "1234" })
    });
    expect(r.status).toBe(200);
    expect(r.data.sessionToken).toBeTruthy();
  });

  it("login rejeita senha errada", async () => {
    const u = uniqueUser();
    await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: u, password: "1234" })
    });
    const r = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: u, password: "wrong" })
    });
    expect(r.status).toBe(401);
  });

  it("login rejeita usuário inexistente", async () => {
    const r = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "ghost_" + Date.now(), password: "1234" })
    });
    expect(r.status).toBe(401);
  });

  it("session valida token", async () => {
    const u = uniqueUser();
    const reg = await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: u, password: "1234" })
    });
    const token = reg.data.sessionToken;
    const r = await request("/api/auth/session", {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(r.status).toBe(200);
    expect(r.data.username).toBe(u);
  });

  it("session rejeita token inválido", async () => {
    const r = await request("/api/auth/session", {
      headers: { Authorization: "Bearer invalid-token" }
    });
    expect(r.status).toBe(401);
  });

  it("logout invalida sessão", async () => {
    const u = uniqueUser();
    const reg = await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: u, password: "1234" })
    });
    const token = reg.data.sessionToken;

    await request("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });

    const session = await request("/api/auth/session", {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(session.status).toBe(401);
  });

  it("change-password funciona com senha correta", async () => {
    const u = uniqueUser();
    const reg = await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: u, password: "1234" })
    });
    const token = reg.data.sessionToken;

    const r = await request("/api/auth/change-password", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: u, currentPassword: "1234", newPassword: "5678" })
    });
    expect(r.status).toBe(200);

    const login = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: u, password: "5678" })
    });
    expect(login.status).toBe(200);
  });

  it("change-password rejeita senha atual errada", async () => {
    const u = uniqueUser();
    const reg = await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: u, password: "1234" })
    });
    const token = reg.data.sessionToken;

    const r = await request("/api/auth/change-password", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: u, currentPassword: "wrong", newPassword: "5678" })
    });
    expect(r.status).toBe(401);
  });
});