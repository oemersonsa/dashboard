import { state, saveState } from "../../core/state.js";
import { platformBadge } from "../../ui/icons.js";
import { escapeAttribute, parseMoney } from "../../core/format.js";
import { toastSuccess, toastError } from "../../ui/toast.js";
import { renderAll } from "../sales/sales.ui.js";

let bound = false;
let signature = "";
let renderSequence = 0;
const draftKey = month => `kanri-returns-draft:${state.auth?.username || ""}:${month}`;

export function init() {
  render();
  if (!bound) { bindEvents(); bound = true; }
}

async function render({ reset = false } = {}) {
  const sequence = ++renderSequence;
  const owner = state.auth?.username;
  const button = document.getElementById("saveReturnsButton");
  button.disabled = true;
  const m = document.getElementById("returnMonth")?.value || state.currentMonth;
  try { await window.dashboard.ensureHistory([m]); } catch (error) { return toastError(error.message); }
  finally { if (sequence === renderSequence) button.disabled = false; }
  if (sequence !== renderSequence || owner !== state.auth?.username || m !== document.getElementById("returnMonth").value) return;
  if (!state.db[m]) state.db[m] = { days: [], returns: {} };
  const r = state.db[m].returns || {};
  const next = JSON.stringify([owner, m, state.platforms, r]);
  if (next === signature && !reset) return;
  signature = next;
  const el = document.getElementById("returnInputs");
  if (!el) return;

  el.innerHTML = state.platforms.filter((p) => !p.archived).map((p) => `
    <div class="fg"><label class="flabel" for="ret_${escapeAttribute(p.key)}">${platformBadge(p)}</label><input type="text" inputmode="decimal" class="finput" id="ret_${escapeAttribute(p.key)}" value="${Number(r[p.key] || 0).toFixed(2)}" step="0.01" min="0"></div>
  `).join("");
  if (reset) sessionStorage.removeItem(draftKey(m));
  else try { const draft = JSON.parse(sessionStorage.getItem(draftKey(m)) || "{}");
    for (const [key, value] of Object.entries(draft)) { const input = document.getElementById(`ret_${key}`); if (input) input.value = value; }
  } catch {}
}

function bindEvents() {
  document.getElementById("returnMonth")?.addEventListener("change", render);
  document.getElementById("saveReturnsButton")?.addEventListener("click", save);
  document.getElementById("cancelReturnsButton")?.addEventListener("click", () => render({ reset: true }));
  document.getElementById("returnInputs")?.addEventListener("input", () => {
    const draft = {}; state.platforms.filter(p => !p.archived).forEach(p => { draft[p.key] = document.getElementById(`ret_${p.key}`)?.value || ""; });
    try { sessionStorage.setItem(draftKey(document.getElementById("returnMonth").value), JSON.stringify(draft)); } catch {}
  });
}

async function save() {
  const m = document.getElementById("returnMonth")?.value;
  if (!m) return;
  if (!state.db[m]) state.db[m] = { days: [], returns: {} };
  const values = {};
  for (const p of state.platforms.filter(p => !p.archived)) {
    const value = parseMoney(document.getElementById(`ret_${p.key}`)?.value || 0);
    if (!Number.isFinite(value) || value < 0) return toastError(`${p.name}: informe um valor válido maior ou igual a zero.`);
    values[p.key] = value;
  }
  Object.assign(state.db[m].returns, values);
  sessionStorage.removeItem(draftKey(m));
  saveState();
  if (m === state.currentMonth) renderAll();
  toastSuccess(`Devoluções salvas`);
}

export { render as renderReturns };
