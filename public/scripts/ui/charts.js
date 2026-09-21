// public/scripts/ui/charts.js
import { alphaColor, hexToRgb } from "../core/format.js";

/**
 * Retorna a cor visível da plataforma respeitando o tema atual.
 * Se a cor for muito escura no tema dark, clareia.
 * Se `alpha` for passado, retorna rgba.
 */
export function getPlatformVisualColor(platform, alpha = null) {
  const base = platform?.color || "#2563eb";
  const isDark = document.body.classList.contains("dark-theme");
  const rgb = hexToRgb(base);
  const brightness = rgb
    ? ((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000
    : 255;

  const visibleBase = isDark && brightness < 72 ? "#f3f4f6" : base;
  return alpha === null ? visibleBase : alphaColor(visibleBase, alpha);
}

/**
 * Cor legível para texto (contraste garantido).
 */
export function getReadablePlatformColor(color) {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const isDark = document.body.classList.contains("dark-theme");
  const brightness = ((rgb.r * 299) + (rgb.g * 587) + (rgb.b * 114)) / 1000;
  if (isDark && brightness < 72) return "#f3f4f6";
  if (!isDark && brightness > 225) return "#111827";
  return color;
}

/**
 * Retorna objeto com base, texto e tons suaves.
 */
export function getPlatformTone(platform) {
  const base = platform?.color || "#2563eb";
  const isDark = document.body.classList.contains("dark-theme");
  return {
    base,
    text: getReadablePlatformColor(base),
    softBg: alphaColor(base, isDark ? 0.18 : 0.12),
    softBorder: alphaColor(base, isDark ? 0.34 : 0.2)
  };
}