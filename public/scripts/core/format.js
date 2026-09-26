export const R = (v) => "R$ " + Number(v || 0).toLocaleString("pt-BR", {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});

export const RS = (v) => {
  const value = Number(v || 0);
  const digits = Number.isInteger(value)
    ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return "R$ " + value.toLocaleString("pt-BR", digits);
};

export const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const escapeAttribute = (value) => escapeHtml(value).replace(/`/g, "&#96;");

export const slugify = (value) =>
  String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function hexToRgb(color) {
  const raw = String(color || "").trim().replace(/^#/, "");
  // Aceita 3 ou 6 dígitos hexadecimais
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return null;

  const full = raw.length === 3
    ? raw.split("").map((c) => c + c).join("")
    : raw;

  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) return null;

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

export function alphaColor(color, alpha) {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const a = Math.max(0, Math.min(1, Number(alpha) || 0));
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
}

export function formatSavedAt(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}