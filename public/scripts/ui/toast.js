// public/scripts/ui/toast.js
let _timer = null;

/**
 * Mostra uma notificação toast.
 * Aceita tanto o elemento do index.html (vazio) quanto um criado do zero.
 */
export function toast(message, type = "info") {
  let el = document.getElementById("toast");

  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }

  // Garante que os filhos existem (o index.html pode ter vindo vazio)
  let textEl = el.querySelector(".toast-text");
  if (!textEl) {
    el.innerHTML = `<span class="toast-icon"></span><span class="toast-text"></span>`;
    textEl = el.querySelector(".toast-text");
  }

  // Aplica classe e conteúdo
  el.className = `toast toast-${type}`;
  textEl.textContent = message;
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");

  // Mostra
  el.classList.add("show");

  // Auto-esconde
  clearTimeout(_timer);
  _timer = setTimeout(() => el.classList.remove("show"), 2800);
}

export const toastSuccess = (msg) => toast(msg, "success");
export const toastError = (msg) => toast(msg, "error");
export const toastInfo = (msg) => toast(msg, "info");