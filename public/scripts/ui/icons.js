import { PLATFORM_DOMAINS, LEGACY_PLATFORM_KEY_ALIASES } from "../core/constants.js";
import { slugify, escapeHtml, escapeAttribute } from "../core/format.js";

function canonicalizePlatformKey(value) {
  const n = slugify(value);
  return LEGACY_PLATFORM_KEY_ALIASES[n] || n;
}

function getPlatformIconSources(platform) {
  const key = canonicalizePlatformKey(platform?.key || platform?.name || "");
  const domain = PLATFORM_DOMAINS[key];

  // Se não achou pelo slug exato, tenta casar por prefixo (ex: "mercado-livre-paraiso" → "mercado-livre")
  let resolvedDomain = domain;
  if (!resolvedDomain) {
    const match = Object.keys(PLATFORM_DOMAINS).find((k) => key.startsWith(k));
    if (match) resolvedDomain = PLATFORM_DOMAINS[match];
  }

  if (!resolvedDomain) return [];
  return [
    `https://a.favicon.im/${resolvedDomain}?larger=true`,
    `https://a.favicon.im/${resolvedDomain}`
  ];
}

export function platformIcon(platform) {
  const sources = getPlatformIconSources(platform);
  const label = String(platform?.icon || platform?.name || "").slice(0, 2).toUpperCase();
  const textColor = platform?.iconText || "#ffffff";
  const bg = escapeAttribute(platform?.color || "#2563eb");

  const img = sources.length
    ? `<img class="platform-icon-img" src="${escapeAttribute(sources[0])}" alt="" loading="lazy" data-fallbacks="${escapeAttribute(JSON.stringify(sources.slice(1)))}">`
    : "";

  return `<span class="platform-icon" style="background:${bg};color:${escapeAttribute(textColor)}">
    <span class="platform-icon-label">${escapeHtml(label)}</span>
    ${img}
  </span>`;
}

export function platformBadge(platform, shortName = false) {
  const l = shortName ? platform.name.split(" ")[0] : platform.name;
  return `<span class="platform-badge">${platformIcon(platform)}<span>${escapeHtml(l)}</span></span>`;
}

export function setupPlatformIconFallbacks() {
  document.addEventListener("error", (event) => {
    const img = event.target;
    if (!img.matches?.(".platform-icon-img")) return;
    let fallbacks = [];
    try { fallbacks = JSON.parse(img.dataset.fallbacks || "[]"); } catch { fallbacks = []; }
    if (fallbacks.length) {
      const next = fallbacks.shift();
      img.dataset.fallbacks = JSON.stringify(fallbacks);
      img.src = next;
    } else {
      img.remove();
    }
  }, true);
}