import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resetTestDb, cleanupTestDb } from "../setup/test-db.js";

let serverInfo;
let token;
const user = `resources_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const platform = {
  key: `test-${Date.now()}`,
  name: "Plataforma de teste",
  icon: "TST",
  color: "#378ADD",
  iconText: "#ffffff"
};

beforeAll(async () => {
  resetTestDb();
  const { startServer } = await import("../../src/server/index.js");
  serverInfo = await startServer({ port: 0, host: "127.0.0.1" });
  const response = await fetch(`${serverInfo.url}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user, password: "senha-segura-1234" })
  });
  const data = await response.json();
  token = data.sessionToken;
  if (!token) throw new Error(`Falha ao criar usuário de teste: ${JSON.stringify(data)}`);
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

async function request(path, { auth = true, ...options } = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (auth) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${serverInfo.url}${path}`, { ...options, headers });
  return { status: response.status, data: await response.json().catch(() => null) };
}

describe("API - recursos de negócio", () => {
  it("lista, salva e relê plataformas", async () => {
    const initial = await request("/api/platforms");
    expect(initial.status).toBe(200);
    expect(initial.data.platforms).toEqual([]);

    const saved = await request("/api/platforms", {
      method: "POST",
      body: JSON.stringify({ platforms: [platform] })
    });
    expect(saved.status).toBe(200);
    expect(saved.data.platforms[0]).toMatchObject({ key: platform.key, name: platform.name });

    const listed = await request("/api/platforms");
    expect(listed.data.platforms).toHaveLength(1);
    expect(listed.data.platforms[0].key).toBe(platform.key);
  });

  it("salva vendas, lista o histórico e retorna o dashboard do mês", async () => {
    await request("/api/platforms", { method: "POST", body: JSON.stringify({ platforms: [platform] }) });
    const month = "2026-Outubro";
    const saved = await request("/api/sales", {
      method: "POST",
      body: JSON.stringify({
        currentMonth: month,
        db: { [month]: { days: [{ d: "03/10", [platform.key]: 850, [`orders_${platform.key}`]: 5 }], returns: {} } }
      })
    });
    expect(saved.status).toBe(200);
    expect(saved.data.sales[month].days[0][platform.key]).toBe(850);

    const listed = await request("/api/sales");
    expect(listed.data.sales[month].days[0][`orders_${platform.key}`]).toBe(5);

    const dashboard = await request(`/api/dashboard/${encodeURIComponent(month)}`);
    expect(dashboard.status).toBe(200);
    expect(dashboard.data).toMatchObject({ month, platforms: [expect.objectContaining({ key: platform.key })] });
    expect(dashboard.data.data.days[0][platform.key]).toBe(850);
  });

  it("salva e lista devoluções", async () => {
    await request("/api/platforms", { method: "POST", body: JSON.stringify({ platforms: [platform] }) });
    const month = "2026-Outubro";
    const saved = await request("/api/returns", {
      method: "POST",
      body: JSON.stringify({ returns: { [month]: { [platform.key]: 125.5 } } })
    });
    expect(saved.status).toBe(200);
    expect(saved.data.state.db[month].returns[platform.key]).toBe(125.5);

    const listed = await request("/api/returns");
    expect(listed.status).toBe(200);
    expect(listed.data.returns[month][platform.key]).toBe(125.5);
  });

  it("cria e remove um mês", async () => {
    const month = "2026-Novembro";
    const saved = await request(`/api/month/${encodeURIComponent(month)}`, {
      method: "POST",
      body: JSON.stringify({ days: [{ d: "01/11", [platform.key]: 300 }], returns: { [platform.key]: 20 } })
    });
    expect(saved.status).toBe(200);

    const state = await request("/api/state");
    expect(state.data.state.db[month].days[0][platform.key]).toBe(300);

    const removed = await request(`/api/month/${encodeURIComponent(month)}`, { method: "DELETE" });
    expect(removed.status).toBe(200);
    const afterRemove = await request("/api/state");
    expect(afterRemove.data.state.db[month]).toBeUndefined();
  });

  it("salva as configurações do período e da precificação", async () => {
    const pricing = { targetMargin: 25, profiles: { [platform.key]: { commissionRate: 11 } } };
    const saved = await request("/api/settings", {
      method: "POST",
      body: JSON.stringify({ currentMonth: "2026-Outubro", currentScreen: "dashboard", pricing })
    });
    expect(saved.status).toBe(200);
    const state = await request("/api/state");
    expect(state.data.state).toMatchObject({ currentMonth: "2026-Outubro", pricing });
  });

  it("persiste metas dentro do estado de negócio", async () => {
    const month = "2026-Outubro";
    const saved = await request("/api/state", {
      method: "POST",
      body: JSON.stringify({ state: {
        platforms: [platform],
        db: {},
        goals: { [month]: { target: 25000 } },
        currentMonth: month,
        currentScreen: "dashboard",
        activeTab: "overview"
      } })
    });
    expect(saved.status).toBe(200);
    expect(saved.data.state.goals[month].target).toBe(25000);
    const reread = await request("/api/state");
    expect(reread.data.state.goals[month].target).toBe(25000);
  });

  it("rejeita uma gravação feita sobre uma versão antiga", async () => {
    const initial = await request("/api/state");
    const body = { state: initial.data.state, expectedUpdatedAt: initial.data.state.updatedAt };
    const first = await request("/api/state", { method: "POST", body: JSON.stringify(body) });
    expect(first.status).toBe(200);
    const stale = await request("/api/state", { method: "POST", body: JSON.stringify(body) });
    expect(stale.status).toBe(409);
    expect(stale.data.error).toBe("state_conflict");
  });

  it("rejeita valor inválido sem modificar os dados", async () => {
    const before = await request("/api/state");
    const invalid = structuredClone(before.data.state);
    invalid.db = { "2026-Outubro": { days: [{ d: "03/10", [platform.key]: -10 }], returns: {} } };
    const saved = await request("/api/state", { method: "POST", body: JSON.stringify({ state: invalid }) });
    expect(saved.status).toBe(400);
    const after = await request("/api/state");
    expect(after.data.state).toEqual(before.data.state);
  });

  it("mantém os dados separados entre usuários", async () => {
    const other = await request("/api/auth/register", { auth: false, method: "POST", body: JSON.stringify({ username: `${user}_other`, password: "senha-segura-1234" }) });
    expect(other.status).toBe(200);
    const read = await request("/api/state", { auth: false, headers: { Authorization: `Bearer ${other.data.sessionToken}` } });
    expect(read.data.state.platforms).toEqual([]);
    expect(read.data.state.db).toEqual({});
  });

  it("exige autenticação nos endpoints de negócio", async () => {
    for (const path of ["/api/platforms", "/api/sales", "/api/returns"]) {
      const response = await request(path, { auth: false });
      expect(response.status, path).toBe(401);
    }
  });
});
