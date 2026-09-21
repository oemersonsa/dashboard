let currentStatus = "idle";
let currentMessage = "";

export function initSaveIndicator() {
  const topbar = document.querySelector(".topbar");
  if (!topbar) return;
  let el = document.getElementById("saveIndicator");
  if (!el) {
    el = document.createElement("div");
    el.id = "saveIndicator";
    el.className = "save-indicator";
    el.innerHTML = `<span class="save-indicator-dot"></span><span class="save-indicator-text">Pronto</span>`;
    const right = topbar.querySelector(".header-right");
    if (right) right.prepend(el);
    else topbar.appendChild(el);
  }
  updateSaveIndicator();
}

export function setSaveStatus(status, message = "") {
  currentStatus = status;
  currentMessage = message;
  updateSaveIndicator();
}

function updateSaveIndicator() {
  const el = document.getElementById("saveIndicator");
  if (!el) return;
  el.dataset.status = currentStatus;
  const text = el.querySelector(".save-indicator-text");
  if (!text) return;
  const labels = {
    idle: "Pronto",
    saving: "Salvando...",
    saved: "Salvo",
    error: "Erro"
  };
  text.textContent = currentMessage || labels[currentStatus] || "Pronto";
}