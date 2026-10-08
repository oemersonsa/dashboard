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
