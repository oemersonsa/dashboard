import { state, parsePeriodKey, getPeriodLabel, saveState } from "../../core/state.js";
import { escapeHtml } from "../../core/format.js";
import { toastError, toastSuccess } from "../../ui/toast.js";
import { openModal, closeModal } from "../../ui/modal.js";
import { ALL_MONTHS } from "../../core/constants.js";
import { renderAll } from "./sales.ui.js";

const SHEETJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
let bound = false;
let pendingRows = [];
let pendingPeriod = "";

export function init() {
  if (bound) return;
  bound = true;
  document.getElementById("salesSheetFileInput")?.addEventListener("change", handleFile);
  document.getElementById("salesSheetImportButton")?.addEventListener("click", applyImport);
  document.querySelectorAll("[data-sales-import-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-sales-import-mode]").forEach((item) => {
        item.classList.toggle("active", item === button);
        item.setAttribute("aria-pressed", String(item === button));
      });
      renderPreview();
    });
  });
}

export function openSalesSheetImport() {
  if (!state.platforms.length) return toastError("Cadastre as plataformas antes de importar vendas");
  pendingRows = [];
  pendingPeriod = state.currentMonth;
  clearPreview();
  const period = document.getElementById("salesSheetPeriod");
  if (period) period.textContent = getPeriodLabel(pendingPeriod);
  openModal("salesSheetImportModal");
}

async function handleFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const status = document.getElementById("salesSheetPreview");
  if (status) status.innerHTML = '<p class="card-sub">Lendo planilha…</p>';
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error("O arquivo deve ter no máximo 10 MB.");
    const XLSX = await loadSheetJs();
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const rows = readDailyRows(XLSX, workbook);
    pendingRows = validateAndGroup(rows);
    if (!pendingRows.length) throw new Error("Não encontrei linhas de vendas válidas na aba Diário.");
    renderPreview();
  } catch (error) {
    pendingRows = [];
    clearPreview();
    if (status) status.innerHTML = `<div class="empty-state" role="alert">${escapeHtml(error.message || "Não foi possível ler a planilha.")}</div>`;
  }
}

function readDailyRows(XLSX, workbook) {
  let matrix = null;
  const dailySheet = workbook.Sheets[workbook.SheetNames.find((name) => normalize(name) === "diario")];
  if (dailySheet) matrix = XLSX.utils.sheet_to_json(dailySheet, { header: 1, raw: false, defval: "" });
  if (!matrix) {
    const csvSheet = workbook.Sheets[workbook.SheetNames[0]];
    matrix = XLSX.utils.sheet_to_json(csvSheet, { header: 1, raw: false, defval: "" });
    const sectionIndex = matrix.findIndex((row) => normalize(row[0]) === "vendas diarias");
    if (sectionIndex >= 0) matrix = matrix.slice(sectionIndex + 1);
  }
  const headerIndex = matrix.findIndex((row) => normalize(row[0]) === "data" && row.some((cell) => / - (vendas|pedidos)$/.test(normalize(cell))));
  if (headerIndex < 0) throw new Error("A planilha precisa ter uma aba/ seção ‘Diário’ com Data e colunas ‘Plataforma - Vendas’ e ‘Plataforma - Pedidos’. Use o relatório exportado pelo sistema.");
  const headers = matrix[headerIndex].map((cell) => String(cell || "").trim());
  const platformColumns = [];
  const unknownPlatforms = new Set();
  headers.forEach((header, index) => {
    const match = header.match(/^(.+)\s+-\s+(vendas|pedidos)$/i);
    if (!match) return;
    const platform = state.platforms.find((item) => normalize(item.name) === normalize(match[1]));
    if (platform) {
      let column = platformColumns.find((item) => item.key === platform.key);
      if (!column) {
        column = { key: platform.key, sales: null, orders: null };
        platformColumns.push(column);
      }
      column[normalize(match[2])] = index;
    } else unknownPlatforms.add(match[1].trim());
  });
  if (unknownPlatforms.size) throw new Error(`Cadastre ou renomeie estas plataformas antes de importar: ${[...unknownPlatforms].join(", ")}.`);
  if (!platformColumns.some((item) => item.sales !== null)) throw new Error("Nenhuma coluna de vendas corresponde às plataformas cadastradas.");
  return matrix.slice(headerIndex + 1).filter((row) => row.some((cell) => String(cell || "").trim())).map((row, index) => ({ row, index: headerIndex + index + 2, platformColumns }));
}

function validateAndGroup(sourceRows) {
  const { year, month } = parsePeriodKey(pendingPeriod);
  const monthIndex = ALL_MONTHS.indexOf(month);
  const grouped = new Map();
  const issues = [];
  sourceRows.forEach(({ row, index, platformColumns }) => {
    const parsedDate = parseDate(row[0]);
    if (!parsedDate || parsedDate.month !== monthIndex + 1 || (parsedDate.year && parsedDate.year !== year)) {
      issues.push(`Linha ${index}: a data não pertence a ${getPeriodLabel(pendingPeriod)}.`);
      return;
    }
    const date = `${String(parsedDate.day).padStart(2, "0")}/${String(parsedDate.month).padStart(2, "0")}`;
    if (!grouped.has(date)) grouped.set(date, { d: date, values: {} });
    const target = grouped.get(date).values;
    platformColumns.forEach(({ key, sales, orders }) => {
      const amount = sales === null ? 0 : parseNumber(row[sales]);
      const count = orders === null ? 0 : parseNumber(row[orders]);
      if (!Number.isFinite(amount) || !Number.isFinite(count) || amount < 0 || count < 0) {
        issues.push(`Linha ${index}: venda ou pedidos com valor inválido.`);
        return;
      }
      if (amount || count) {
        if (!target[key]) target[key] = { amount: 0, orders: 0 };
        target[key].amount += amount;
        target[key].orders += Math.round(count);
      }
    });
  });
  if (issues.length) throw new Error(`${issues.slice(0, 4).join(" ")}${issues.length > 4 ? ` E mais ${issues.length - 4} inconsistências.` : ""}`);
  return [...grouped.values()].filter((item) => Object.keys(item.values).length);
}

function renderPreview() {
  const el = document.getElementById("salesSheetPreview");
  const button = document.getElementById("salesSheetImportButton");
  if (!el || !pendingRows.length) return;
  let conflicts = 0;
  let cells = 0;
  pendingRows.forEach((row) => Object.entries(row.values).forEach(([key, value]) => {
    cells++;
    const existing = state.db[pendingPeriod]?.days?.find((day) => day.d === row.d);
    if (Number(existing?.[key] || 0) > 0 || Number(existing?.[`orders_${key}`] || 0) > 0) conflicts++;
  }));
  el.innerHTML = `<div class="sales-import-summary" role="status"><strong>${pendingRows.length} dias encontrados</strong><span>${cells} combinações de plataforma/dia${conflicts ? ` · ${conflicts} já têm dados` : " · nenhum conflito encontrado"}</span><span>Destino: ${escapeHtml(getPeriodLabel(pendingPeriod))}</span></div>
    <div class="sales-import-table-wrap"><table class="sales-import-table"><thead><tr><th>Data</th><th>Plataformas com dados</th><th>Conflitos</th></tr></thead><tbody>${pendingRows.slice(0, 8).map((row) => {
      const keys = Object.keys(row.values);
      const conflictsHere = keys.filter((key) => {
        const existing = state.db[pendingPeriod]?.days?.find((day) => day.d === row.d);
        return Number(existing?.[key] || 0) > 0 || Number(existing?.[`orders_${key}`] || 0) > 0;
      });
      return `<tr><td>${escapeHtml(row.d)}</td><td>${keys.length}</td><td>${conflictsHere.length ? `${conflictsHere.length} existente(s)` : "—"}</td></tr>`;
    }).join("")}</tbody></table>${pendingRows.length > 8 ? `<div class="card-sub">Prévia das primeiras 8 datas.</div>` : ""}</div>`;
  if (button) button.disabled = false;
}

function applyImport() {
  if (!pendingRows.length) return;
  const replace = document.querySelector('[data-sales-import-mode="replace"].active');
  let added = 0;
  let skipped = 0;
  const month = state.db[pendingPeriod] || (state.db[pendingPeriod] = { days: [], returns: {} });
  pendingRows.forEach((row) => {
    let day = month.days.find((item) => item.d === row.d);
    if (!day) {
      day = { d: row.d };
      state.platforms.forEach((platform) => { day[platform.key] = 0; day[`orders_${platform.key}`] = 0; });
      month.days.push(day);
    }
    Object.entries(row.values).forEach(([key, value]) => {
      const hasExisting = Number(day[key] || 0) > 0 || Number(day[`orders_${key}`] || 0) > 0;
      if (hasExisting && !replace) { skipped++; return; }
      day[key] = value.amount;
      day[`orders_${key}`] = value.orders;
      added++;
    });
  });
  month.days.sort((a, b) => Number(a.d.slice(0, 2)) - Number(b.d.slice(0, 2)));
  saveState();
  if (state.currentMonth === pendingPeriod) renderAll();
  closeModal("salesSheetImportModal");
  toastSuccess(`Importação concluída: ${added} combinações atualizadas${skipped ? `; ${skipped} duplicadas ignoradas` : ""}.`);
  pendingRows = [];
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { day: value.getDate(), month: value.getMonth() + 1, year: value.getFullYear() };
  const match = String(value || "").trim().match(/^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{4}))?$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3] ? Number(match[3]) : null;
  const daysInMonth = new Date(year || 2024, month, 0).getDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth ? { day, month, year } : null;
}

function parseNumber(value) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim().replace(/R\$\s?/gi, "").replace(/\s/g, "");
  if (!text) return 0;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  return Number(normalized);
}

function normalize(value) {
  return String(value || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function clearPreview() {
  const preview = document.getElementById("salesSheetPreview");
  const button = document.getElementById("salesSheetImportButton");
  if (preview) preview.innerHTML = '<p class="card-sub">Selecione uma planilha para conferir os dados antes de importar.</p>';
  if (button) button.disabled = true;
}

function loadSheetJs() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SHEETJS_URL;
    script.async = true;
    script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error("Não foi possível carregar o leitor de planilhas."));
    script.onerror = () => reject(new Error("Não foi possível carregar o leitor de planilhas. Verifique a conexão e tente novamente."));
    document.head.appendChild(script);
  });
}
