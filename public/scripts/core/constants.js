export const STORAGE_KEY = "dashboard-vendas-state-v2";
export const STORAGE_BACKUP_KEY = "dashboard-vendas-state-v2-backup";
export const AUTH_STORAGE_KEY = "dashboard-vendas-auth-v2";
export const LAST_SAVED_KEY = "dashboard-vendas-last-saved-v1";
export const SESSION_KEY = "dashboard-vendas-session-v1";
export const THEME_KEY = "dashboard-vendas-theme-v1";
export const SESSION_DURATION_MS = 365 * 24 * 60 * 60 * 1000;

export const ALL_MONTHS = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export const SHORT = {
  Janeiro: "Jan", Fevereiro: "Fev", Marco: "Mar", Abril: "Abr",
  Maio: "Mai", Junho: "Jun", Julho: "Jul", Agosto: "Ago",
  Setembro: "Set", Outubro: "Out", Novembro: "Nov", Dezembro: "Dez"
};

export const BRAND_COLORS = [
  "#2563eb", "#ff5722", "#14b8a6", "#fb923c",
  "#e11d48", "#7c3aed", "#0ea5e9", "#16a34a"
];

export const LEGACY_PLATFORM_PRESETS = {
  ml: { name: "Mercado Livre", icon: "ML", color: "#ffe500", iconText: "#1f2937" },
  sh: { name: "Shopee", icon: "SH", color: "#ff5722", iconText: "#ffffff" },
  se: { name: "Shein", icon: "SE", color: "#2c18db", iconText: "#ffffff" },
  mg: { name: "Magalu", icon: "MG", color: "#0086ff", iconText: "#ffffff" },
  nu: { name: "Nuvem Shop", icon: "NS", color: "#00a86b", iconText: "#ffffff" },
  tk: { name: "TikTok", icon: "TT", color: "#fe2c55", iconText: "#ffffff" },
  kw: { name: "Kwai", icon: "KW", color: "#fb923c", iconText: "#ffffff" }
};

export const LEGACY_PLATFORM_KEY_ALIASES = {
  ml: "mercado-livre", mercadolivre: "mercado-livre",
  sh: "shopee", se: "shein", mg: "magalu", "magazine-luiza": "magalu",
  nu: "nuvem-shop", nuvemshop: "nuvem-shop", ns: "nuvem-shop",
  tk: "tiktok", "tiktok-shop": "tiktok", kw: "kwai"
};

export const PLATFORM_DOMAINS = {
  // Mercado Livre (inclui variações)
  "mercado-livre": "mercadolivre.com.br",
  "mercado-livre-paraiso": "mercadolivre.com.br",
  "mercado-livre-paraíso": "mercadolivre.com.br",

  // Shopee (inclui variações)
  "shopee": "shopee.com.br",
  "shopee-paraiso": "shopee.com.br",
  "shopee-paraíso": "shopee.com.br",

  // Outros
  "shein": "shein.com.br",
  "magalu": "magazineluiza.com.br",
  "nuvem-shop": "nuvemshop.com.br",
  "tiktok": "tiktok.com",
  "kwai": "kwai.com"
};

export const PRICING_DEFAULTS = {
  productCost: 0, packagingCost: 0, extraCost: 0, shippingSubsidy: 0,
  targetMargin: 20, targetProfit: 20, manualPrice: 0, mode: "margin", profiles: {}
};

export const MARKETPLACE_PRICING_PRESETS = {
  "mercado-livre": {
    label: "Mercado Livre", commissionRate: 12, transactionRate: 0,
    fixedFee: 6.5, extraShippingCost: 0, sourceType: "official",
    note: "Baseado nas tabelas publicas do Mercado Livre."
  },
  shopee: {
    label: "Shopee", commissionRate: 20, transactionRate: 0, fixedFee: 4,
    extraShippingCost: 0,
    feeTiers: [
      { min: 0, max: 7.99, commissionRate: 50, fixedFee: 0 },
      { min: 8, max: 79.99, commissionRate: 20, fixedFee: 4 },
      { min: 80, max: 99.99, commissionRate: 14, fixedFee: 16 },
      { min: 100, max: 199.99, commissionRate: 14, fixedFee: 20 },
      { min: 200, max: null, commissionRate: 14, fixedFee: 26 }
    ],
    sourceType: "estimated", note: "Referencia 2026 por faixa de preco."
  },
  shein: { label: "Shein", commissionRate: 16, transactionRate: 0, fixedFee: 0, extraShippingCost: 0, sourceType: "estimated", note: "Estimativa inicial." },
  magalu: { label: "Magalu", commissionRate: 16, transactionRate: 0, fixedFee: 0, extraShippingCost: 0, sourceType: "estimated", note: "Estimativa inicial." },
  "nuvem-shop": { label: "Nuvem Shop", commissionRate: 0.7, transactionRate: 0, fixedFee: 0, extraShippingCost: 0, sourceType: "official", note: "Referencia publica do plano Escala." },
  tiktok: { label: "TikTok", commissionRate: 6, transactionRate: 6, fixedFee: 4, extraShippingCost: 0, sourceType: "estimated", note: "Estimativa 2026." },
  kwai: { label: "Kwai", commissionRate: 20, transactionRate: 0, fixedFee: 4, extraShippingCost: 0, sourceType: "estimated", note: "Estimativa 2026." }
};

export const DASH_HTML = '<span style="color:var(--muted)">-</span>';