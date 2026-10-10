import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createRequire } from "node:module";
import { resetTestDb, cleanupTestDb } from "../setup/test-db.js";
import { ALL_MONTHS } from "../../public/scripts/core/constants.js";

const require = createRequire(import.meta.url);

let serverInfo;
let token;

beforeAll(async () => {
  resetTestDb();
  const { startServer } = await import("../../src/server/index.js");
  serverInfo = await startServer({ port: 0, host: "127.0.0.1" });

  // Username único a cada execução
  const testUser = `apitester_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const res = await fetch(`${serverInfo.url}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: testUser, password: "senha-segura-1234" })
  });
  const data = await res.json();
  token = data.sessionToken;

  if (!token) {
    throw new Error("Falha ao criar usuário de teste: " + JSON.stringify(data));
  }
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

  it("salva e relê um ano de vendas, pedidos, devoluções e metas em vários lotes", async () => {
    const platforms = ["ml", "sh", "mag"].map(key => ({ key, name: key, icon: key, color: "#378ADD" }));
    const db = {};
    const goals = {};
    ALL_MONTHS.forEach((month, index) => {
      const period = `2026-${month}`;
      db[period] = {
        days: Array.from({ length: new Date(2026, index + 1, 0).getDate() }, (_, day) => ({
          d: `${String(day + 1).padStart(2, "0")}/${String(index + 1).padStart(2, "0")}`,
          ml: 100 + day, orders_ml: day + 1,
          sh: 200 + day, orders_sh: day + 2,
          mag: 0, orders_mag: 3
        })),
        returns: { ml: 10, sh: 20, mag: 0 }
      };
      goals[period] = { target: 25000 };
    });
    const initial = await request("/api/state");
    const body = { state: { platforms, db, goals, currentMonth: "2026-Dezembro" }, expectedUpdatedAt: initial.data.state.updatedAt };
    const saved = await request("/api/state", { method: "POST", body: JSON.stringify(body) });
    expect(saved.status).toBe(200);
    const read = await request("/api/state");
    expect(read.data.state.db).toEqual(db);
    expect(read.data.state.goals).toEqual(goals);
    expect(read.data.state.updatedAt).toBe(saved.data.state.updatedAt);
    const stale = await request("/api/state", { method: "POST", body: JSON.stringify(body) });
    expect(stale.status).toBe(409);
    expect((await request("/api/state")).data.state).toEqual(read.data.state);
  });

  it("preserva todo o histórico se um lote falhar depois de gravar parte das vendas", async () => {
    const before = await request("/api/state");
    const next = structuredClone(before.data.state);
    next.db["2026-Janeiro"].days[0].ml = 9999;
    const { client } = require("../../src/db/index.js");
    const transaction = client.transaction.bind(client);
    const spy = vi.spyOn(client, "transaction").mockImplementation(async (...args) => {
      const tx = await transaction(...args);
      const batch = tx.batch.bind(tx);
      let calls = 0;
      tx.batch = async statements => {
        if (++calls === 3) throw new Error("simulated_database_failure");
        return batch(statements);
      };
      return tx;
    });
    try {
      const failed = await request("/api/state", { method: "POST", body: JSON.stringify({ state: next, expectedUpdatedAt: before.data.state.updatedAt }) });
      expect(failed.status).toBe(500);
    } finally {
      spy.mockRestore();
    }
    expect((await request("/api/state")).data.state).toEqual(before.data.state);
  });

  it("consulta apenas os períodos necessários, com histórico completo disponível para backup", async () => {
    const full = await request("/api/state");
    const initial = await request("/api/state?initial=1&month=2026-Dezembro");
    expect(initial.status).toBe(200);
    expect(initial.data.state.periods).toHaveLength(12);
    expect(Object.keys(initial.data.state.db).sort()).toEqual(["2026-Dezembro", "2026-Novembro", "2026-Outubro"].sort());
    expect(initial.data.state.db["2026-Dezembro"]).toEqual(full.data.state.db["2026-Dezembro"]);
    const one = await request(`/api/state?periods=2026-Janeiro&version=${encodeURIComponent(full.data.state.updatedAt)}`);
    expect(Object.keys(one.data.state.db)).toEqual(["2026-Janeiro"]);
    expect(JSON.stringify(one.data).length).toBeLessThan(JSON.stringify(full.data).length / 4);
    expect((await request("/api/state?periods=2026-Janeiro&version=stale")).status).toBe(409);
    console.log("Payloads de leitura (bytes):", { full: Buffer.byteLength(JSON.stringify(full.data)), initial: Buffer.byteLength(JSON.stringify(initial.data)), oneMonth: Buffer.byteLength(JSON.stringify(one.data)) });
  });

  it("edita uma data sem recriar plataformas nem outras vendas e retorna só a versão", async () => {
    const before = (await request("/api/state")).data.state;
    const { queryAll } = require("../../src/db/index.js");
    const ids = await queryAll("SELECT id FROM platforms ORDER BY id");
    const untouched = await queryAll("SELECT id, amount FROM sales WHERE month = ? ORDER BY id", ["2026-Fevereiro"]);
    const day = { ...before.db["2026-Janeiro"].days[0], ml: 4321.56 };
    const payload = { expectedUpdatedAt: before.updatedAt, changes: { months: { "2026-Janeiro": { days: [day], deletedDays: [], returns: {} } } } };
    const saved = await request("/api/state", { method: "PATCH", body: JSON.stringify(payload) });
    expect(saved.status).toBe(200); expect(saved.data.state).toBeUndefined(); expect(saved.data.updatedAt).toBeTruthy();
    const after = (await request("/api/state")).data.state;
    expect(after.db["2026-Janeiro"].days[0].ml).toBe(4321.56);
    expect(after.db["2026-Fevereiro"]).toEqual(before.db["2026-Fevereiro"]);
    expect(await queryAll("SELECT id FROM platforms ORDER BY id")).toEqual(ids);
    expect(await queryAll("SELECT id, amount FROM sales WHERE month = ? ORDER BY id", ["2026-Fevereiro"])).toEqual(untouched);
    expect((await request("/api/state", { method: "PATCH", body: JSON.stringify(payload) })).status).toBe(409);
    console.log("Payloads de gravação (bytes):", { full: Buffer.byteLength(JSON.stringify({ state: before, expectedUpdatedAt: before.updatedAt })), incremental: Buffer.byteLength(JSON.stringify(payload)) });
  });

  it("preserva dias zerados e meses vazios depois de recarregar", async () => {
    const version = (await request("/api/state")).data.state.updatedAt;
    const saved = await request("/api/state", { method: "PATCH", body: JSON.stringify({ expectedUpdatedAt: version, changes: { months: {
      "2027-Janeiro": { days: [{ d: "01/01", ml: 0, orders_ml: 0 }], deletedDays: [], returns: {} },
      "2027-Fevereiro": { days: [], deletedDays: [], returns: {} }
    } } }) });
    expect(saved.status).toBe(200);
    const read = (await request("/api/state")).data.state;
    expect(read.db["2027-Janeiro"].days[0].ml).toBe(0);
    expect(read.db["2027-Fevereiro"].days).toEqual([]);
  });

  it("rejeita edições inválidas e não altera os dados", async () => {
    const before = (await request("/api/state")).data.state;
    const invalid = await request("/api/state", { method: "PATCH", body: JSON.stringify({ expectedUpdatedAt: before.updatedAt, changes: { months: {
      "2026-Janeiro": { days: [{ d: "32/01", ml: -1 }], deletedDays: [], returns: {} }
    } } }) });
    expect(invalid.status).toBe(400);
    expect((await request("/api/state")).data.state).toEqual(before);
    expect((await request("/api/state", { method: "PATCH", body: JSON.stringify({ changes: {} }) })).status).toBe(400);
    const unauthenticated = await fetch(`${serverInfo.url}/api/state`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(unauthenticated.status).toBe(401);
  });

  it("desfaz a transação incremental inteira se um lote falhar", async () => {
    const before = (await request("/api/state")).data.state;
    const { client } = require("../../src/db/index.js");
    const transaction = client.transaction.bind(client);
    const spy = vi.spyOn(client, "transaction").mockImplementation(async (...args) => {
      const tx = await transaction(...args); const batch = tx.batch.bind(tx);
      if (args[0] === "write") tx.batch = async statements => { await batch(statements); throw new Error("patch_failure"); };
      return tx;
    });
    try {
      const failed = await request("/api/state", { method: "PATCH", body: JSON.stringify({ expectedUpdatedAt: before.updatedAt, changes: { goals: { "2026-Janeiro": { target: 999 } } } }) });
      expect(failed.status).toBe(500);
    } finally { spy.mockRestore(); }
    expect((await request("/api/state")).data.state).toEqual(before);
  });
});
