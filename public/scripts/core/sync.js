export function createSync({ storage, user, snapshot, request, status, onConflict, onExpired, scope = "", delay = 200 }) {
  let version = null;
  let timer;
  let flight;
  let blocked = false;
  let attempts = 0;
  const key = () => `dashboard-pending-v1:${user()}${scope ? `:${scope}` : ""}`;
  const clone = value => JSON.parse(JSON.stringify(value));
  function pending() {
    try { return JSON.parse(storage.getItem(key()) || "null"); } catch { return null; }
  }
  function capture() {
    if (!user()) return;
    const old = pending();
    storage.setItem(key(), JSON.stringify({ state: clone(snapshot()), version: old?.version ?? version, savedAt: Date.now() }));
  }
  function schedule() {
    try { capture(); }
    catch { status("error", "Sem espaço para guardar as alterações neste dispositivo"); return; }
    clearTimeout(timer);
    if (blocked) return;
    status("saving");
    timer = setTimeout(() => void flush(), delay);
  }
  async function flush() {
    clearTimeout(timer);
    if (flight) return flight;
    if (!user() || blocked || version === null) return false;
    flight = (async () => {
      while (pending()) {
        const owner = user();
        const storageKey = key();
        const sent = pending();
        status("saving");
        try {
          const result = await request({ state: sent.state, expectedUpdatedAt: version });
          if (user() !== owner) return false;
          version = result.state.updatedAt;
          const current = pending();
          if (JSON.stringify(current?.state) === JSON.stringify(sent.state)) {
            storage.removeItem(storageKey);
            // Limpa cópias recuperadas da mesma edição sem apagar rascunhos diferentes.
            if (scope) {
              const matches = [];
              for (let i = 0; i < storage.length; i++) {
                const candidate = storage.key(i);
                if (!candidate?.startsWith(`dashboard-pending-v1:${owner}:`)) continue;
                try {
                  const draft = JSON.parse(storage.getItem(candidate));
                  if (draft.version === sent.version && JSON.stringify(draft.state) === JSON.stringify(sent.state)) matches.push(candidate);
                } catch {}
              }
              matches.forEach(candidate => storage.removeItem(candidate));
            }
          }
          else if (current) storage.setItem(storageKey, JSON.stringify({ ...current, version }));
          attempts = 0;
        } catch (error) {
          if (user() !== owner) return false;
          const message = error.message === "invalid_business_data"
            ? "Dados inválidos. Revise as datas e os valores ou exporte as alterações pendentes."
            : error.status === 413
              ? "Os dados excedem o limite de envio. Exporte as alterações pendentes."
              : error.status === 429
                ? "Muitos envios. Tentando novamente…"
                : "Alterações pendentes";
          status("error", message);
          if (error.status === 409) { blocked = true; onConflict(); }
          else if (error.status === 401) { blocked = true; onExpired(); }
          else if (!error.status || error.status === 429 || error.status >= 500) timer = setTimeout(() => void flush(), Math.min(30000, 1000 * 2 ** attempts++));
          return false;
        }
      }
      status("saved");
      return true;
    })();
    try { return await flight; } finally { flight = null; }
  }
  function initialize(remote) {
    clearTimeout(timer);
    version = remote.updatedAt || "";
    blocked = false;
    let local = pending();
    // Recupera rascunhos também quando o navegador abre uma nova sessão.
    if (!local && scope) {
      const prefix = `dashboard-pending-v1:${user()}:`;
      const drafts = [];
      for (let i = 0; i < storage.length; i++) {
        const candidate = storage.key(i);
        if (!candidate?.startsWith(prefix)) continue;
        try { const draft = JSON.parse(storage.getItem(candidate)); if (draft?.state) drafts.push(draft); } catch {}
      }
      local = drafts.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
      if (local) storage.setItem(key(), JSON.stringify(local));
    }
    if (!local) return remote;
    if (local.version !== version) { blocked = true; status("error", "Conflito de alterações"); onConflict(); }
    else timer = setTimeout(() => void flush(), delay);
    return local.state;
  }
  function discard() {
    const local = pending();
    if (local) storage.setItem(`dashboard-recovery-v1:${user()}`, JSON.stringify(local));
    storage.removeItem(key());
    if (local && scope) {
      const matches = [];
      for (let i = 0; i < storage.length; i++) {
        const candidate = storage.key(i);
        if (!candidate?.startsWith(`dashboard-pending-v1:${user()}:`)) continue;
        try {
          const draft = JSON.parse(storage.getItem(candidate));
          if (draft.version === local.version && JSON.stringify(draft.state) === JSON.stringify(local.state)) matches.push(candidate);
        } catch {}
      }
      matches.forEach(candidate => storage.removeItem(candidate));
    }
    blocked = false;
  }
  return { schedule, flush, initialize, pending, discard };
}
