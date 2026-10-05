import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetTestDb, cleanupTestDb } from "../setup/test-db.js";

let serverInfo;

beforeAll(async () => {
  resetTestDb();
  const { startServer } = await import("../../src/server/index.js");
  serverInfo = await startServer({ port: 0, host: "127.0.0.1" });
});

afterAll(async () => {
  const { stopServer } = await import("../../src/server/index.js");
  try {
    await stopServer();
    const { client } = await import("../../src/db/index.js");
    await client.close();
  } finally {
    await cleanupTestDb();
  }
});

let counter = 0;
const validPassword = "senha-segura-1234";
const replacementPassword = "nova-senha-segura-5678";
const uniqueUser = () =>
  `user_${Date.now()}_${counter++}_${Math.random().toString(36).slice(2, 8)}`;

async function request(path, opts = {}) {
  const res = await fetch(`${serverInfo.url}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) }
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

describe("API - Auth", () => {
  it("register cria novo usuário", async () => {
    const r = await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: uniqueUser(), password: validPassword })
    });
    expect(r.status).toBe(200);
    expect(r.data.sessionToken).toBeTruthy();
  });

  it("register rejeita usuário duplicado", async () => {
    const u = uniqueUser();
    await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: u, password: validPassword })
    });
    const r = await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: u, password: replacementPassword })
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
      body: JSON.stringify({ username: u, password: validPassword })
    });
    const r = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: u, password: validPassword })
    });
    expect(r.status).toBe(200);
    expect(r.data.sessionToken).toBeTruthy();
  });

  it("login rejeita senha errada", async () => {
    const u = uniqueUser();
    await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: u, password: validPassword })
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
      body: JSON.stringify({ username: "ghost_" + Date.now(), password: validPassword })
    });
    expect(r.status).toBe(401);
  });

  it("session valida token", async () => {
    const u = uniqueUser();
    const reg = await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: u, password: validPassword })
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
      body: JSON.stringify({ username: u, password: validPassword })
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
      body: JSON.stringify({ username: u, password: validPassword })
    });
    const token = reg.data.sessionToken;

    const r = await request("/api/auth/change-password", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: u, currentPassword: validPassword, newPassword: replacementPassword })
    });
    expect(r.status).toBe(200);

    const login = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: u, password: replacementPassword })
    });
    expect(login.status).toBe(200);
  });

  it("change-password rejeita senha atual errada", async () => {
    const u = uniqueUser();
    const reg = await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: u, password: validPassword })
    });
    const token = reg.data.sessionToken;

    const r = await request("/api/auth/change-password", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: u, currentPassword: "senha-atual-incorreta", newPassword: replacementPassword })
    });
    expect(r.status).toBe(401);
  });

  it("lê e atualiza o perfil autenticado", async () => {
    const u = uniqueUser();
    const registered = await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: u, password: validPassword })
    });
    const headers = { Authorization: `Bearer ${registered.data.sessionToken}` };

    const initial = await request("/api/auth/profile", { headers });
    expect(initial.status).toBe(200);
    expect(initial.data.profile).toMatchObject({ displayName: "", avatarData: "" });

    const updated = await request("/api/auth/profile", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ displayName: "Vendedora Teste", avatarData: null })
    });
    expect(updated.status).toBe(200);
    expect(updated.data.profile.displayName).toBe("Vendedora Teste");

    const reread = await request("/api/auth/profile", { headers });
    expect(reread.data.profile.displayName).toBe("Vendedora Teste");
  });

  it("valida os limites do perfil e exige autenticação", async () => {
    const u = uniqueUser();
    const registered = await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: u, password: validPassword })
    });
    const headers = { Authorization: `Bearer ${registered.data.sessionToken}` };
    const tooLong = await request("/api/auth/profile", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ displayName: "x".repeat(61) })
    });
    expect(tooLong.status).toBe(400);
    expect(tooLong.data.error).toBe("display_name_too_long");

    const unauthorized = await request("/api/auth/profile", { auth: false });
    expect(unauthorized.status).toBe(401);
  });
});
