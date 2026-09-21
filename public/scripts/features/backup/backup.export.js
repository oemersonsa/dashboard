import { state, saveState, normalizeState } from "../../core/state.js";
import { MARKETPLACE_PRICING_PRESETS } from "../../core/constants.js";
import { slugify } from "../../core/format.js";
import { loadSession, saveSession } from "../../core/api.js";
import { toast, toastSuccess, toastError } from "../../ui/toast.js";
import { openModal, closeModal } from "../../ui/modal.js";

let bound = false;
let pendingMode = "merge";

export function init() {
  if (!bound) { bindEvents(); bound = true; }
}

export function getBackupPayload() {
  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    sessionUser: loadSession(),
    state
  };
}

export function exportBackup() {
  const p = JSON.stringify(getBackupPayload(), null, 2);
  const b = new Blob([p], { type: "application/json" });
  const u = URL.createObjectURL(b);
  const l = document.createElement("a");
  l.href = u;
  l.download = `dashboard-vendas-backup-${slugify(state.currentMonth || "dados")}.json`;
  l.click();
  URL.revokeObjectURL(u);
  toastSuccess("Backup exportado com sucesso");
}

export async function importBackupFile(file, mode = "merge") {
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const pa = state.auth ? { ...state.auth } : null;
    const ps = loadSession();
    const src = payload?.state ? payload.state : payload;
    const rs = normalizeState(src, MARKETPLACE_PRICING_PRESETS);

    state.auth = pa || rs.auth;

    if (mode === "replace") {
      state.platforms = rs.platforms.map((p) => ({ ...p }));
      state.db = JSON.parse(JSON.stringify(rs.db || {}));
      state.currentMonth = rs.currentMonth;
    } else {
      mergeImported(rs);
    }

    saveState();
    if (ps && state.auth?.username === ps.username) {
      saveSession(ps.username, ps.provider, ps.serverSessionToken);
    }
    toastSuccess(mode === "replace" ? "Backup substituído" : "Backup importado");
    window.dispatchEvent(new CustomEvent("dashboard:reload"));
  } catch (e) {
    console.error(e);
    toastError("Não foi possível importar o backup");
  }
}

function mergeImported(rs) {
  const existing = state.platforms || [];
  const merged = [...existing];
  rs.platforms.forEach((p) => { if (!merged.some((i) => i.key === p.key)) merged.push(p); });
  state.platforms = merged;

  Object.keys(rs.db || {}).forEach((month) => {
    if (!state.db[month]) { state.db[month] = rs.db[month]; return; }
    const cur = state.db[month];
    const imp = rs.db[month];
    const byDate = new Map(cur.days.map((d) => [d.d, d]));
    imp.days.forEach((id) => {
      if (!byDate.has(id.d)) { cur.days.push(id); return; }
      const ed = byDate.get(id.d);
      state.platforms.forEach((p) => {
        const cv = Number(ed[p.key] || 0);
        const iv = Number(id[p.key] || 0);
        if (cv === 0 && iv > 0) ed[p.key] = iv;
        const ok = `orders_${p.key}`;
        const co = Math.max(0, Math.round(Number(ed[ok] || 0)));
        const io = Math.max(0, Math.round(Number(id[ok] || 0)));
        if (co === 0 && io > 0) ed[ok] = io;
      });
    });
    state.platforms.forEach((p) => {
      const cr = Number(cur.returns?.[p.key] || 0);
      const ir = Number(imp.returns?.[p.key] || 0);
      cur.returns[p.key] = Math.max(cr, ir);
    });
  });
}

function bindEvents() {
  document.querySelectorAll("[data-import-mode]").forEach((b) => {
    b.addEventListener("click", () => {
      pendingMode = b.dataset.importMode;
      document.querySelectorAll("[data-import-mode]").forEach((x) =>
        x.classList.toggle("active", x === b));
    });
  });

  document.getElementById("confirmImportBackupButton")?.addEventListener("click", () => {
    document.getElementById("backupFileInputModal")?.click();
  });

  document.getElementById("backupFileInputModal")?.addEventListener("change", (e) => {
    importBackupFile(e.target.files?.[0], pendingMode);
    e.target.value = "";
  });
}