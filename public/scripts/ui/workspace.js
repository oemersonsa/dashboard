import { getMode, setMode } from "./theme.js";

export function initWorkspace() {
  const sidebar = document.getElementById("dashboardSidebar");
  document.querySelector(".app").prepend(sidebar);
  sidebar.hidden = true;
  document.addEventListener("click", event => {
    const theme = event.target.closest("[data-theme-choice]");
    if (theme) setMode(theme.dataset.themeChoice);
  });
  window.addEventListener("dashboard:theme-change", refreshAppearance);
}

export function renderWorkspace(screen, visible) {
  document.body.classList.toggle("workspace-active", visible);
  document.body.dataset.screen = screen;
  document.getElementById("dashboardSidebar").hidden = !visible;
  document.querySelectorAll(".sidebar-item").forEach(button => {
    const active = screen === "dashboard" ? false : button.dataset.screenNav === screen || (screen === "dailyClose" && button.id === "sidebarOpenDailyClose") || (screen === "setup" && button.id === "sidebarManagePlatformsButton");
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  refreshAppearance();
}

function refreshAppearance() {
  document.querySelectorAll("[data-theme-choice]").forEach(button => {
    const active = button.dataset.themeChoice === getMode();
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}
