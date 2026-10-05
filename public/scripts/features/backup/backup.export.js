import { state, saveState, normalizeState, getBusinessSnapshot } from "../../core/state.js";
import { MARKETPLACE_PRICING_PRESETS } from "../../core/constants.js";
import { slugify } from "../../core/format.js";
import { loadSession, saveSession } from "../../core/api.js";
import { toast, toastSuccess, toastError } from "../../ui/toast.js";
import { openModal, closeModal } from "../../ui/modal.js";
import { validateBackup } from "./backup.validation.js";

let bound = false;
let pendingMode = "merge";
let pendingImport = null;

export function init() {
  if (!bound) { bindEvents(); bound = true; }
}

export function getBackupPayload() {
  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    state: JSON.parse(JSON.stringify(getBusinessSnapshot()))
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

export async function importBackupFile(file, mode = "merge", confirmed = false) {
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error("O backup deve ter até 10 MB.");
    const payload = JSON.parse(await file.text());
    const { source: src, summary } = validateBackup(payload);
    if (!confirmed) {
      pendingImport = { file, mode };
      document.getElementById("backupPreviewSummary").textContent = `${summary} Modo: ${mode === "replace" ? "substituir" : "mesclar"}.`;
      closeModal("importBackupModal");
      openModal("backupPreviewModal");
      return;
    }
    const pa = state.auth ? { ...state.auth } : null;
    const ps = loadSession();
    const rs = normalizeState(src, MARKETPLACE_PRICING_PRESETS);

    localStorage.setItem(`dashboard-recovery-v1:${ps?.username || "local"}`, JSON.stringify(getBackupPayload()));
    state.auth = pa;

    if (mode === "replace") {
      state.platforms = rs.platforms.map((p) => ({ ...p }));
      state.db = JSON.parse(JSON.stringify(rs.db || {}));
      state.goals = JSON.parse(JSON.stringify(rs.goals || {}));
      state.currentMonth = rs.currentMonth;
      state.pricing = rs.pricing;
    } else {
      mergeImported(rs);
    }

    saveState();
    if (ps && state.auth?.username === ps.username) {
      saveSession(ps.username, ps.provider, ps.serverSessionToken);
    }
    toastSuccess(mode === "replace" ? "Backup substituído" : "Backup importado");
    window.dispatchEvent(new CustomEvent("dashboard:reload"));
    closeModal("backupPreviewModal");
    pendingImport = null;
  } catch (e) {
    console.error(e);
    toastError(e instanceof SyntaxError ? "O arquivo não é um JSON válido." : e.message || "Não foi possível importar o backup");
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

  // Merge de goals (backup vence se não existir local)
  if (!state.goals) state.goals = {};
  Object.entries(rs.goals || {}).forEach(([month, value]) => {
    const target = Number(value?.target ?? value ?? 0);
    if (Number.isFinite(target) && target > 0) {
      if (!state.goals[month]) state.goals[month] = { target };
    }
  });
}

function bindEvents() {
  document.getElementById("applyBackupImportButton")?.addEventListener("click", async () => {
    if (!pendingImport) return;
    const button = document.getElementById("applyBackupImportButton");
    button.disabled = true;
    try { await importBackupFile(pendingImport.file, pendingImport.mode, true); }
    finally { button.disabled = false; }
  });
  document.getElementById("exportRecoveryBackupButton")?.addEventListener("click", () => {
    const raw = localStorage.getItem(`dashboard-recovery-v1:${loadSession()?.username || "local"}`);
    if (!raw) return toastError("Não há cópia de recuperação neste dispositivo.");
    const payload = JSON.parse(raw);
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 3, state: payload.state })], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "backup-recuperacao.json"; link.click(); URL.revokeObjectURL(url);
  });
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
