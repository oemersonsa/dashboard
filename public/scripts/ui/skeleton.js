/* ═══════════════════════════════════════════════════════════════
   ui/skeleton.js — Helpers para exibir estados de carregamento
   ═══════════════════════════════════════════════════════════════ */

/* ═══ KPIs ═══ */
export function renderKpiSkeleton(count = 5) {
  const el = document.getElementById("kpiRow");
  if (!el) return;

  el.innerHTML = Array.from({ length: count }).map(() => `
    <div class="kpi-card is-skeleton">
      <div class="kpi-label"></div>
      <div class="kpi-value"></div>
      <div class="kpi-change"></div>
    </div>
  `).join("");
}

/* ═══ Gráfico ═══ */
export function showChartSkeleton(canvasId = "dailyChart", bars = 14) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const parent = canvas.parentElement;
  if (!parent) return;

  // Remove skeleton anterior, se existir
  parent.querySelector(".chart-skeleton")?.remove();

  const heights = [40, 65, 55, 80, 70, 90, 60, 75, 85, 50, 95, 65, 70, 55];

  const skel = document.createElement("div");
  skel.className = "chart-skeleton";
  skel.innerHTML = Array.from({ length: bars }).map((_, i) => {
    const h = heights[i % heights.length];
    return `<div class="chart-skeleton-bar" style="height: ${h}%"></div>`;
  }).join("");

  parent.style.position = "relative";
  parent.appendChild(skel);
  canvas.style.opacity = "0.3";
}

export function hideChartSkeleton(canvasId = "dailyChart") {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const parent = canvas.parentElement;
  if (!parent) return;
  parent.querySelector(".chart-skeleton")?.remove();
  canvas.style.opacity = "1";
}

/* ═══ Platform bars (Mix) ═══ */
export function showPlatformBarsSkeleton(rows = 5) {
  const el = document.getElementById("platformBars");
  if (!el) return;

  el.innerHTML = `<div class="bar-skeleton">${Array.from({ length: rows }).map(() => `
    <div class="bar-skeleton-row">
      <div class="bar-skeleton-head">
        <div class="bar-skeleton-dot"></div>
        <div class="bar-skeleton-line" style="width: 40%"></div>
      </div>
      <div class="bar-skeleton-line" style="width: 100%"></div>
    </div>
  `).join("")}</div>`;
}

/* ═══ Tabela ═══ */
export function showTableSkeleton(tableId, rows = 6, cols = 5) {
  const t = document.getElementById(tableId);
  if (!t) return;

  t.innerHTML = `<div class="table-skeleton">${Array.from({ length: rows }).map(() => `
    <div class="table-skeleton-row" style="grid-template-columns: 60px repeat(${cols}, 1fr)">
      ${Array.from({ length: cols + 1 }).map(() => `<div></div>`).join("")}
    </div>
  `).join("")}</div>`;
}

/* ═══ Overlay global (tela cheia) ═══ */
export function showGlobalLoader() {
  let el = document.querySelector(".global-loader");
  if (!el) {
    el = document.createElement("div");
    el.className = "global-loader";
    el.innerHTML = `<div class="global-loader-spinner"></div>`;
    document.body.appendChild(el);
  }
  requestAnimationFrame(() => el.classList.add("is-visible"));
}

export function hideGlobalLoader() {
  const el = document.querySelector(".global-loader");
  if (!el) return;
  el.classList.remove("is-visible");
  setTimeout(() => el.remove(), 300);
}