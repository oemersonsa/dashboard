import { state, saveState, normalizePlatform, slugifyText, canonicalizePlatformKey } from "../../core/state.js";
import { BRAND_COLORS, BRAND_COLORS_V2, nextFreeBrandColor, PRICING_DEFAULTS } from "../../core/constants.js";
import { escapeHtml, escapeAttribute } from "../../core/format.js";
import { platformIcon } from "../../ui/icons.js";
import { toast, toastSuccess, toastError } from "../../ui/toast.js";
import { setActiveScreen, renderScreen } from "../../main.js";

let editingKey = null;
let bound = false;

export function init() {
  render();
  if (!bound) { bindEvents(); bound = true; }
}

function getPlatforms() { return state.platforms || []; }

function resetForm() {
  editingKey = null;
  const n = document.getElementById("platformName");
  const s = document.getElementById("platformShort");
  const c = document.getElementById("platformColor");
  const b = document.getElementById("addPlatformConfigButton");
  const cb = document.getElementById("cancelPlatformEditButton");

  if (n) n.value = "";
  if (s) s.value = "";
  if (c) c.value = BRAND_COLORS[getPlatforms().length % BRAND_COLORS.length];
  if (b) b.textContent = "Adicionar Plataforma";
  if (cb) cb.hidden = true;
}

function render() {
  const l = document.getElementById("platformConfigList");
  if (!l) return;

  if (!getPlatforms().length) {
    l.innerHTML = `<div class="empty-state">Nenhuma plataforma cadastrada ainda.</div>`;
    resetForm();
    return;
  }

  l.innerHTML = getPlatforms().map((p) => `
    <div class="setup-item${p.archived ? " setup-item-archived" : ""}">
      <div class="setup-item-main">
        ${platformIcon(p)}
        <div class="setup-item-copy">
          <strong>${escapeHtml(p.name)}</strong>
          <span>Sigla ${escapeHtml(p.icon)} · ${escapeHtml(p.color)}${p.archived ? " · Arquivada" : ""}</span>
        </div>
      </div>
      <div class="setup-item-actions">
        ${p.archived
          ? `<button class="btn btn-secondary" data-restore-platform="${escapeAttribute(p.key)}" type="button">Reativar</button>`
          : `<button class="btn btn-secondary" data-edit-platform="${escapeAttribute(p.key)}" type="button">Editar</button><button class="btn btn-secondary" data-remove-platform="${escapeAttribute(p.key)}" type="button">Arquivar</button>`}
      </div>
    </div>
  `).join("");
}

function bindEvents() {
  document.getElementById("platformConfigList")?.addEventListener("click", (e) => {
    const restoreBtn = e.target.closest("[data-restore-platform]");
    if (restoreBtn) return restorePlatform(restoreBtn.dataset.restorePlatform);
    const editBtn = e.target.closest("[data-edit-platform]");
    if (editBtn) return startEdit(editBtn.dataset.editPlatform);

    const removeBtn = e.target.closest("[data-remove-platform]");
    if (removeBtn) return removePlatform(removeBtn.dataset.removePlatform);
  });

  document.getElementById("addPlatformConfigButton")
    ?.addEventListener("click", addOrUpdate);
  document.getElementById("cancelPlatformEditButton")
    ?.addEventListener("click", resetForm);
  document.getElementById("finishSetupButton")
    ?.addEventListener("click", finish);
  document.getElementById("logoutFromSetupButton")
    ?.addEventListener("click", async () => {
      const { handleLogout } = await import("../auth/auth.ui.js");
      handleLogout();
    });
}

function startEdit(key) {
  const p = getPlatforms().find((x) => x.key === key);
  if (!p) return;
  editingKey = key;
  const n = document.getElementById("platformName");
  const s = document.getElementById("platformShort");
  const c = document.getElementById("platformColor");
  const b = document.getElementById("addPlatformConfigButton");
  const cb = document.getElementById("cancelPlatformEditButton");

  if (n) n.value = p.name;
  if (s) s.value = p.icon;
  if (c) c.value = p.color;
  if (b) b.textContent = "Salvar Edição";
  if (cb) cb.hidden = false;
}

function addOrUpdate() {
  const name = document.getElementById("platformName")?.value.trim();
  const short = document.getElementById("platformShort")?.value.trim().toUpperCase() || "";
  const color = document.getElementById("platformColor")?.value || "#2563eb";
  if (!name) return toastError("Informe o nome da plataforma");

  if (editingKey) {
    const p = getPlatforms().find((x) => x.key === editingKey);
    if (!p) { resetForm(); render(); return toastError("Plataforma não encontrada"); }
    p.name = name;
    p.icon = (short || name.slice(0, 2)).slice(0, 3);
    p.color = color;
    saveState();
    render();
    resetForm();
    toastSuccess("Plataforma atualizada");
    return;
  }

  const key = canonicalizePlatformKey(name);
  if (getPlatforms().some((p) => p.key === key)) {
    return toastError("Essa plataforma já foi cadastrada");
  }
  state.platforms.push(normalizePlatform(
    { key, name, icon: short || name.slice(0, 2), color },
    getPlatforms().length
  ));
  saveState();
  render();
  resetForm();
  toastSuccess("Plataforma adicionada");
}

function removePlatform(key) {
  const platform = getPlatforms().find((p) => p.key === key);
  if (!platform) return;
  const hasHistory = Object.values(state.db).some((month) =>
    Number(month?.returns?.[key] || 0) > 0 || (month?.days || []).some((day) =>
      Number(day?.[key] || 0) > 0 || Number(day?.[`orders_${key}`] || 0) > 0
    )
  );
  const impact = hasHistory
    ? "Os dados históricos serão mantidos e continuarão nos totais e relatórios."
    : "Nenhum lançamento foi encontrado para esta plataforma.";
  if (!window.confirm(`Arquivar ${platform.name}?\n\nEla sairá dos novos lançamentos. ${impact}\nVocê poderá reativá-la depois.`)) return;
  if (editingKey === key) resetForm();
  platform.archived = true;
  saveState();
  render();
  toastSuccess("Plataforma arquivada; histórico preservado");
}

function restorePlatform(key) {
  const platform = getPlatforms().find((item) => item.key === key);
  if (!platform) return;
  platform.archived = false;
  saveState();
  render();
  toastSuccess(`${platform.name} reativada`);
}

function finish() {
  if (!getPlatforms().length) return toastError("Cadastre ao menos uma plataforma");
  if (!state.db[state.currentMonth]) {
    state.db[state.currentMonth] = { days: [], returns: {} };
  }
  saveState();
  setActiveScreen("hub");
  renderScreen();
}
