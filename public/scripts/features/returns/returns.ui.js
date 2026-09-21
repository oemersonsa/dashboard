import { state, saveState } from "../../core/state.js";
import { platformBadge } from "../../ui/icons.js";
import { escapeAttribute } from "../../core/format.js";
import { toastSuccess, toastError } from "../../ui/toast.js";
import { renderAll } from "../sales/sales.ui.js";

let bound = false;

export function init() {
  render();
  if (!bound) { bindEvents(); bound = true; }
}

function render() {
  const m = document.getElementById("returnMonth")?.value || state.currentMonth;
  if (!state.db[m]) state.db[m] = { days: [], returns: {} };
  const r = state.db[m].returns || {};
  const el = document.getElementById("returnInputs");
  if (!el) return;

  el.innerHTML = state.platforms.map((p) => `
    <div class="fg"><label class="flabel">${platformBadge(p)}</label><input type="number" class="finput" id="ret_${escapeAttribute(p.key)}" value="${Number(r[p.key] || 0).toFixed(2)}" step="0.01" min="0"></div>
  `).join("");
}

function bindEvents() {
  document.getElementById("returnMonth")?.addEventListener("change", render);
  document.getElementById("saveReturnsButton")?.addEventListener("click", save);
  document.getElementById("cancelReturnsButton")?.addEventListener("click", render);
}

function save() {
  const m = document.getElementById("returnMonth")?.value;
  if (!m) return;
  if (!state.db[m]) state.db[m] = { days: [], returns: {} };
  state.platforms.forEach((p) => {
    state.db[m].returns[p.key] = parseFloat(document.getElementById(`ret_${p.key}`)?.value || 0) || 0;
  });
  saveState();
  if (m === state.currentMonth) renderAll();
  toastSuccess(`Devoluções salvas`);
}

export { render as renderReturns };