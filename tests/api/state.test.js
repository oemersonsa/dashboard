import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetTestDb, cleanupTestDb } from "../setup/test-db.js";

let serverInfo;
let token;

beforeAll(async () => {
  resetTestDb();
  await new Promise((r) => setTimeout(r, 100));

  // Importa módulos APÓS o reset (para pegar o novo caminho)
  const { startServer } = await import("../../src/server/index.js");
  serverInfo = await startServer({ port: 0, host: "127.0.0.1" });

  // Cria usuário
  const res = await fetch(`${serverInfo.url}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "apitester", password: "1234" })
  });
  const data = await res.json();
  token = data.sessionToken;
  if (!token) throw new Error("Falha ao criar usuário de teste: " + JSON.stringify(data));
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
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {})
    }
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

describe("API - State", () => {
  it("GET /api/state retorna estado vazio inicial", async () => {
    const r = await request("/api/state");
    expect(r.status).toBe(200);
    expect(r.data.state).toBeDefined();
    expect(r.data.state.platforms).toEqual([]);
  });

  it("POST /api/state salva plataformas", async () => {
    const payload = {
      state: {
        platforms: [
          { key: "ml", name: "Mercado Livre", icon: "ML", color: "#ffe500", iconText: "#000" },
          { key: "sh", name: "Shopee", icon: "SH", color: "#ff5722", iconText: "#fff" }
        ],
        db: {},
        currentMonth: "2026-Setembro",
        currentScreen: "hub",
        pricing: null
      }
    };
    const r = await request("/api/state", { method: "POST", body: JSON.stringify(payload) });
    expect(r.status).toBe(200);
    expect(r.data.state.platforms.length).toBe(2);
  });

  it("POST /api/state salva vendas", async () => {
    const payload = {
      state: {
        platforms: [
          { key: "ml", name: "Mercado Livre", icon: "ML", color: "#ffe500", iconText: "#000" }
        ],
        db: {
          "2026-Setembro": {
            days: [{ d: "01/09", ml: 1000, orders_ml: 10 }],
            returns: { ml: 100 }
          }
        },
        currentMonth: "2026-Setembro",
        currentScreen: "dashboard",
        pricing: null
      }
    };
    const r = await request("/api/state", { method: "POST", body: JSON.stringify(payload) });
    expect(r.status).toBe(200);

    const get = await request("/api/state");
    expect(get.data.state.db["2026-Setembro"].days.length).toBe(1);
    expect(get.data.state.db["2026-Setembro"].days[0].ml).toBe(1000);
    expect(get.data.state.db["2026-Setembro"].returns.ml).toBe(100);
  });

  it("POST /api/state requer autenticação", async () => {
    const res = await fetch(`${serverInfo.url}/api/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    expect(res.status).toBe(401);
  });
});