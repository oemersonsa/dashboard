// public/scripts/ui/modal.js

export function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add("open");
}

export function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove("open");
  if (id === "importBackupModal") {
    document.querySelectorAll("[data-import-mode]").forEach((b) => {
      b.classList.toggle("active", b.dataset.importMode === "merge");
    });
  }
}

let bound = false;

export function bindModalDismiss() {
  if (bound) {
    //console.log("[modal] já estava bound");
    return;
  }
  bound = true;

  //console.log("[modal] bindModalDismiss: registrando listeners globais");

  // Delegação: cobre qualquer modal, atual ou futuro
  document.addEventListener("click", (event) => {
    // 1. Clique em botão com data-close-modal
    const closeBtn = event.target.closest("[data-close-modal]");
    if (closeBtn) {
      console.log("[modal] X clicado para:", closeBtn.dataset.closeModal);
      event.preventDefault();
      event.stopPropagation();
      closeModal(closeBtn.dataset.closeModal);
      return;
    }

    // 2. Clique no overlay (fora do .modal)
    const overlay = event.target.closest(".moverlay");
    if (overlay && event.target === overlay) {
      //console.log("[modal] overlay clicado:", overlay.id);
      closeModal(overlay.id);
    }
  });

  // 3. ESC fecha
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const openM = document.querySelector(".moverlay.open");
    if (openM) {
      //console.log("[modal] ESC fechou:", openM.id);
      closeModal(openM.id);
    }
  });

  //console.log("[modal] listeners registrados");
}