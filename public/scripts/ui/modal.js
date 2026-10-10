const origins = new Map();
let bound = false;
const focusable = root => [...root.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')]
  .filter(el => !el.disabled && !el.hidden && el.getClientRects().length);

export function openModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay || overlay.classList.contains("open")) return;
  origins.set(id, document.activeElement);
  const dialog = overlay.querySelector(".modal") || overlay.firstElementChild;
  dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.tabIndex = -1;
  const title = dialog.querySelector(".mtitle, [id$='Title']");
  if (title) { title.id ||= id + "Title"; dialog.setAttribute("aria-labelledby", title.id); }
  overlay.querySelectorAll(".mclose").forEach(button => button.setAttribute("aria-label", "Fechar janela"));
  overlay.classList.add("open");
  document.querySelector(".app")?.setAttribute("inert", "");
  document.body.style.overflow = "hidden";
  (focusable(dialog)[0] || dialog).focus();
}

export function closeModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.remove("open");
  window.dispatchEvent(new CustomEvent("dashboard:modal-closed", { detail: { id } }));
  if (!document.querySelector(".moverlay.open")) {
    document.querySelector(".app")?.removeAttribute("inert"); document.body.style.removeProperty("overflow");
  }
  const origin = origins.get(id); origins.delete(id);
  if (origin?.isConnected && origin.getClientRects().length) origin.focus();
  if (id === "importBackupModal") document.querySelectorAll("[data-import-mode]").forEach(button => {
    button.classList.toggle("active", button.dataset.importMode === "merge");
  });
}

export function bindModalDismiss() {
  if (bound) return;
  bound = true;
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-close-modal]");
    if (button) { event.preventDefault(); closeModal(button.dataset.closeModal); return; }
    if (event.target.matches(".moverlay.open")) closeModal(event.target.id);
  });
  document.addEventListener("keydown", event => {
    const overlay = [...document.querySelectorAll(".moverlay.open")].at(-1);
    if (!overlay || event.defaultPrevented) return;
    if (event.key === "Escape") { event.preventDefault(); closeModal(overlay.id); }
    if (event.key === "Tab") {
      const elements = focusable(overlay); const first = elements[0]; const last = elements.at(-1);
      if (!first) { event.preventDefault(); overlay.firstElementChild.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener("focusin", event => {
    const overlay = [...document.querySelectorAll(".moverlay.open")].at(-1);
    if (overlay && !overlay.contains(event.target)) (focusable(overlay)[0] || overlay.firstElementChild).focus();
  });
}
