import { describe, it, expect, vi, afterEach } from "vitest";
import { createSync } from "../../public/scripts/core/sync.js";

afterEach(() => vi.useRealTimers());
function setup(request = vi.fn(async () => ({ state: { updatedAt: "v2" } }))) {
  const data = new Map();
  const storage = { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k), get length() { return data.size; }, key: i => [...data.keys()][i] };
  let state = { platforms: [], db: {}, goals: { target: 1 } };
  const conflict = vi.fn(); const expired = vi.fn();
  const status = vi.fn();
  const sync = createSync({ storage, user: () => "alice", snapshot: () => state, request, status, onConflict: conflict, onExpired: expired });
  sync.initialize({ updatedAt: "v1" });
  return { sync, storage, request, status, conflict, expired, update: value => { state.goals.target = value; sync.schedule(); } };
}
describe("sincronização", () => {
  it.each(["navigation", "already-saved", "different-edit", "legacy-saved"])("revisa rascunho antigo com segurança: %s", async scenario => {
    vi.useFakeTimers();
    const { storage } = setup();
    const base = { platforms: [{ key: "ml", name: "ML" }], pricing: null, goals: {}, db: {
      "2026-Janeiro": { days: [{ d: "01/01", ml: 10 }], returns: {} }
    } };
    const local = structuredClone(base);
    local.activeTab = "entries";
    if (scenario !== "navigation") local.db["2026-Janeiro"].days[0].ml = 20;
    const remote = structuredClone(base);
    remote.updatedAt = "new";
    if (scenario === "already-saved" || scenario === "legacy-saved") {
      remote.db["2026-Janeiro"].days[0].ml = 20;
      remote.db["2026-Janeiro"].days.push({ d: "02/01", ml: 30 });
    }
    if (scenario === "legacy-saved") local.db = structuredClone(remote.db);
    const draft = { state: local, version: "old", savedAt: 1, ...(scenario === "legacy-saved" ? {} : { base }) };
    storage.setItem("dashboard-pending-v1:bob:old-tab", JSON.stringify(draft));
    const conflict = vi.fn(); const request = vi.fn();
    const sync = createSync({ storage, scope: "new-tab", user: () => "bob", snapshot: () => local,
      request, status: vi.fn(), onConflict: conflict, onExpired: vi.fn(), incremental: true });
    expect(sync.hasDraft()).toBe(true);
    const result = sync.initialize(remote);
    if (scenario === "different-edit") {
      expect(conflict).toHaveBeenCalledOnce(); expect(result).toEqual(local);
      expect(sync.pending()).toBeTruthy(); expect(await sync.flush()).toBe(false);
    } else {
      expect(conflict).not.toHaveBeenCalled(); expect(result).toEqual(remote);
      expect(sync.hasDraft()).toBe(false);
      expect(JSON.parse(storage.getItem("dashboard-recovery-v1:bob"))).toEqual(draft);
    }
    expect(request).not.toHaveBeenCalled();
  });
  it("preserva a base do rascunho e envia uma edição incremental após recarregar", async () => {
    vi.useFakeTimers();
    const { storage } = setup();
    const remote = { updatedAt: "v1", platforms: [], pricing: null, goals: {}, db: { "2026-Outubro": { days: [], returns: {} } } };
    let edited = structuredClone(remote);
    const request = vi.fn(async () => ({ updatedAt: "v2" }));
    const options = { storage, user: () => "bob", snapshot: () => edited, request, status: vi.fn(), onConflict: vi.fn(), onExpired: vi.fn(), incremental: true };
    const first = createSync(options); first.initialize(remote);
    edited.db["2026-Outubro"].days.push({ d: "01/10", ml: 10 }); first.schedule();
    const restored = createSync(options); restored.initialize(remote);
    await restored.flush();
    expect(request.mock.calls[0][0].changes.months["2026-Outubro"].days).toEqual([{ d: "01/10", ml: 10 }]);
    expect(request.mock.calls[0][0].state).toBeUndefined();
    expect(restored.pending()).toBeNull();
  });
  it("meses carregados sob demanda passam a fazer parte da base, sem gerar edições", async () => {
    vi.useFakeTimers(); const { storage } = setup();
    const remote = { updatedAt: "v1", platforms: [], pricing: null, goals: {}, db: {} };
    const edited = structuredClone(remote); const request = vi.fn();
    const sync = createSync({ storage, user: () => "bob", snapshot: () => edited, request, status: vi.fn(), onConflict: vi.fn(), onExpired: vi.fn(), incremental: true });
    sync.initialize(remote);
    const db = { "2026-Janeiro": { days: [{ d: "01/01", ml: 100 }], returns: {} } };
    expect(sync.hydrate({ updatedAt: "v1", db })).toBe(true); Object.assign(edited.db, db);
    sync.schedule(); await sync.flush(); expect(request).not.toHaveBeenCalled();
    expect(sync.hydrate({ updatedAt: "old", db })).toBe(false);
  });
  it("confirma apenas a cópia enviada e envia a edição feita durante a requisição", async () => {
    vi.useFakeTimers();
    let release;
    const request = vi.fn().mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValue({ state: { updatedAt: "v3" } });
    const { sync, update } = setup(request);
    update(1); const saving = sync.flush(); update(2);
    release({ state: { updatedAt: "v2" } }); await saving;
    expect(request.mock.calls.map(c => c[0].state.goals.target)).toEqual([1, 2]);
    expect(request.mock.calls[1][0].expectedUpdatedAt).toBe("v2");
    expect(sync.pending()).toBeNull();
  });
  it("guarda alterações após falha e reenvia automaticamente", async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ state: { updatedAt: "v2" } });
    const { sync, update } = setup(request); update(7);
    expect(await sync.flush()).toBe(false); expect(sync.pending().state.goals.target).toBe(7);
    await vi.advanceTimersByTimeAsync(1000);
    expect(request).toHaveBeenCalledTimes(2); expect(sync.pending()).toBeNull();
  });
  it("restaura o rascunho após recarregar", () => {
    vi.useFakeTimers(); const { sync, update } = setup(); update(8);
    expect(sync.initialize({ updatedAt: "v1" }).goals.target).toBe(8);
  });
  it("bloqueia conflito e preserva a cópia local", async () => {
    vi.useFakeTimers(); const { sync, update, conflict } = setup(vi.fn().mockRejectedValue({ status: 409 })); update(9);
    await sync.flush(); expect(conflict).toHaveBeenCalled(); expect(sync.pending()).toBeTruthy();
    expect(await sync.flush()).toBe(false);
  });
  it("preserva alterações quando a sessão expira", async () => {
    vi.useFakeTimers(); const { sync, update, expired } = setup(vi.fn().mockRejectedValue({ status: 401 })); update(9);
    await sync.flush(); expect(expired).toHaveBeenCalled(); expect(sync.pending()).toBeTruthy();
  });
  it("explica os dados rejeitados e preserva o rascunho sem repetir automaticamente", async () => {
    vi.useFakeTimers();
    const { sync, update, request, status } = setup(vi.fn().mockRejectedValue({ status: 400, message: "invalid_business_data" }));
    update(9);
    expect(await sync.flush()).toBe(false);
    expect(status).toHaveBeenLastCalledWith("error", expect.stringContaining("Dados inválidos"));
    expect(sync.pending().state.goals.target).toBe(9);
    await vi.advanceTimersByTimeAsync(60000);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("detecta conflito ao recuperar e cria cópia antes de descartar", () => {
    vi.useFakeTimers(); const { sync, update, conflict, storage } = setup(); update(4);
    sync.initialize({ updatedAt: "other-device" }); expect(conflict).toHaveBeenCalled();
    sync.discard(); expect(storage.getItem("dashboard-recovery-v1:alice")).toBeTruthy();
  });
  it("recupera o rascunho de outra sessão e limpa apenas cópias da mesma edição", async () => {
    vi.useFakeTimers();
    const { storage } = setup();
    const draft = { version: "v1", state: { value: 7 }, savedAt: 1 };
    storage.setItem("dashboard-pending-v1:alice:old-tab", JSON.stringify(draft));
    const sync = createSync({ storage, scope: "new-tab", user: () => "alice", snapshot: () => draft.state,
      request: vi.fn(async () => ({ state: { updatedAt: "v2" } })), status: vi.fn(), onConflict: vi.fn(), onExpired: vi.fn() });
    expect(sync.initialize({ updatedAt: "v1" })).toEqual(draft.state);
    await sync.flush();
    expect(storage.getItem("dashboard-pending-v1:alice:old-tab")).toBeUndefined();
    expect(sync.pending()).toBeNull();
  });
  it("descarta as cópias recuperadas sem reabrir o conflito", () => {
    vi.useFakeTimers();
    const { storage } = setup();
    storage.setItem("dashboard-pending-v1:alice:old", JSON.stringify({ version: "v1", state: { value: 1 } }));
    const sync = createSync({ storage, scope: "new", user: () => "alice", snapshot: () => ({}), request: vi.fn(), status: vi.fn(), onConflict: vi.fn(), onExpired: vi.fn() });
    sync.initialize({ updatedAt: "v2" }); sync.discard();
    expect(sync.initialize({ updatedAt: "v2" })).toEqual({ updatedAt: "v2" });
  });
});
