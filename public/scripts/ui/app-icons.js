const paths = {
  logout: '<path d="M10 4H3v16h7m4-13 5 5-5 5m-7-5h12"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
  store: '<path d="M3 9 5 3h14l2 6M3 9v4h18V9M5 13v8h14v-8M9 21v-6h6v6"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M12 17v4m-5 0h10"/>',
  home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  clipboard: '<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6m-6 4h6"/>',
  bars: '<path d="M4 20V10m5 10V4m5 16v-7m5 7V7M2 22h20"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-14 4h2m3 0h2m3 0h1"/>',
  link: '<path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 1 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
  trend: '<path d="m3 17 6-6 4 3 8-9m-6 0h6v6"/>',
  target: '<circle cx="11" cy="13" r="8"/><circle cx="11" cy="13" r="4.5"/><path d="m11 13 9-10m-4 0h4v4"/>',
  report: '<path d="M14 2H5v20h14V7zM14 2v5h5M8 12h8m-8 4h8"/>',
  calculator: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h1m6 0h1m-8 4h1m6 0h1m-8 4h1m6 0h1"/>',
  roas: '<path d="M3 20V9h5v11m3 0V4h5v16m3 0v-8h3v8"/>',
  wallet: '<rect x="3" y="6" width="18" height="15" rx="2"/><path d="m3 6 14-3v3m4 6h-6v5h6m-3-2.5h.01"/>',
  settings: '<path d="m9 3 1-1h4l1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L1 9l2-4 3 1 3-1z"/><circle cx="12" cy="12" r="3"/>',
  backup: '<path d="M3 8h18v13H3zM2 3h20v5H2zm7 10h6"/>',
  money: '<circle cx="12" cy="12" r="9"/><path d="M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9m3-10v12"/>',
  orders: '<path d="M2 3h3l3 13h11l3-9H6m3 13h.01M18 20h.01"/>',
  ticket: '<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7" cy="7" r="1"/>',
  returns: '<path d="M4 9a8 8 0 1 1 0 7M4 3v6h6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  plus: '<path d="M12 5v14m-7-7h14"/>'
};
export function appIcon(name, className = "") {
  return `<svg class="app-icon icon-${name} ${className}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.bars}</svg>`;
}
export function hydrateAppIcons(root = document) {
  root.querySelectorAll("[data-app-icon]").forEach(el => { el.innerHTML = appIcon(el.dataset.appIcon); });
}
