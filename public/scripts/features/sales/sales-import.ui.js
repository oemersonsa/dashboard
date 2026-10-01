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
let sourceMatrix = [];
let sourceHeaders = [];
let headerIndex = 0;

export function init() {
  if (bound) return;
  bound = true;
  document.getElementById("salesSheetFileInput")?.addEventListener("change", handleFile);
  document.getElementById("salesSheetImportButton")?.addEventListener("click", applyImport);
  document.getElementById("salesImportMapping")?.addEventListener("change", (event) => {
    if (!event.target.matches("select")) return;
    pendingRows = [];
    document.getElementById("salesSheetImportButton").disabled = true;
    const preview = document.getElementById("salesSheetPreview");
    if (preview) preview.innerHTML = '<p class="card-sub">Mapeamento alterado. Clique em “Conferir dados” antes de importar.</p>';
  });
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
  sourceMatrix = [];
  sourceHeaders = [];
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
  pendingRows = [];
  sourceMatrix = [];
  sourceHeaders = [];
  const mapping = document.getElementById("salesImportMapping");
  if (mapping) { mapping.hidden = true; mapping.replaceChildren(); }
  document.getElementById("salesSheetImportButton").disabled = true;
  const status = document.getElementById("salesSheetPreview");
  if (status) status.innerHTML = '<p class="card-sub">Lendo planilha…</p>';
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error("O arquivo deve ter no máximo 10 MB.");
    const XLSX = await loadSheetJs();
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const parsed = findTable(XLSX, workbook);
    sourceMatrix = parsed.matrix;
    sourceHeaders = parsed.headers;
    headerIndex = parsed.headerIndex;
    renderMapping();
  } catch (error) {
    pendingRows = [];
    clearPreview();
    if (status) status.innerHTML = `<div class="empty-state" role="alert">${escapeHtml(error.message || "Não foi possível ler a planilha.")}</div>`;
  }
}

function findTable(XLSX, workbook) {
  for (const name of workbook.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: "" });
    const candidates = matrix.slice(0, 30).map((row, index) => ({
      index,
      row,
      score: row.reduce((score, cell) => {
        const header = normalize(cell);
        return score + (/data|date|dia|venda|valor|faturamento|pedido|order|sales|amount/.test(header) ? 1 : 0);
      }, 0)
    })).filter((item) => item.row.filter((cell) => String(cell || "").trim()).length >= 2);
    const candidate = candidates.sort((a, b) => b.score - a.score)[0];
    const index = candidate?.index ?? -1;
    if (index >= 0 && matrix.length > index + 1) {
      const headers = matrix[index].map((cell, column) => String(cell || "").trim() || `Coluna ${column + 1}`);
      return { matrix, headers, headerIndex: index };
    }
  }
  throw new Error("Não encontrei uma tabela com cabeçalho e linhas de dados.");
}

function renderMapping() {
  const el = document.getElementById("salesImportMapping");
  if (!el || !sourceHeaders.length) return;
  const options = (selected, includeBlank = false) => `${includeBlank ? '<option value="">Não importar</option>' : ""}${sourceHeaders.map((header, index) => `<option value="${index}" ${Number(selected) === index ? "selected" : ""}>${escapeHtml(header)}</option>`).join("")}`;
  const guessedDate = sourceHeaders.findIndex((header) => /data|date/i.test(header));
  const rows = state.platforms.filter((platform) => !platform.archived).map((platform) => {
    const platformMatch = normalize(platform.name);
    const guess = (kind) => sourceHeaders.findIndex((header) => {
      const h = normalize(header);
      return h.includes(platformMatch) && (kind === "sales" ? /venda|valor|faturamento|total|sales|amount/.test(h) : /pedido|order|quantidade/.test(h));
    });
    return `<div class="sales-import-map-row"><strong>${escapeHtml(platform.name)}</strong><label class="fg"><span class="flabel">Vendas</span><select class="finput" data-map-platform="${escapeAttribute(platform.key)}" data-map-kind="sales"><option value="">Não importar</option>${sourceHeaders.map((header, index) => `<option value="${index}" ${index === guess("sales") ? "selected" : ""}>${escapeHtml(header)}</option>`).join("")}</select></label><label class="fg"><span class="flabel">Pedidos</span><select class="finput" data-map-platform="${escapeAttribute(platform.key)}" data-map-kind="orders">${options(guess("orders"), true)}</select></label></div>`;
  }).join("");
  el.hidden = false;
  el.innerHTML = `<div class="sales-import-map-row"><strong>Data do lançamento</strong><label class="fg"><span class="flabel">Coluna de data</span><select class="finput" id="salesImportDateColumn">${sourceHeaders.map((header, index) => `<option value="${index}" ${index === guessedDate ? "selected" : ""}>${escapeHtml(header)}</option>`).join("")}</select></label></div>${rows}<button class="btn btn-secondary" id="salesImportPreviewButton" type="button">Conferir dados</button>`;
  document.getElementById("salesImportPreviewButton")?.addEventListener("click", buildPreview);
  document.getElementById("salesSheetImportButton").disabled = true;
  const preview = document.getElementById("salesSheetPreview");
  if (preview) preview.innerHTML = '<p class="card-sub">Associe as colunas e selecione “Conferir dados”.</p>';
}

function buildPreview() {
  const dateColumn = Number(document.getElementById("salesImportDateColumn")?.value);
  const platformColumns = [];
  document.querySelectorAll("[data-map-platform]").forEach((select) => {
    const entry = platformColumns.find((item) => item.key === select.dataset.mapPlatform)
      || { key: select.dataset.mapPlatform, sales: null, orders: null };
    const raw = select.value;
    entry[select.dataset.mapKind] = raw === "" ? null : Number(raw);
    if (!platformColumns.includes(entry)) platformColumns.push(entry);
  });
  if (!platformColumns.some((item) => item.sales !== null || item.orders !== null)) {
    return showImportError("Associe pelo menos uma coluna de vendas ou pedidos.");
  }
  const dataRows = sourceMatrix.slice(headerIndex + 1).filter((row) => row.some((cell) => String(cell || "").trim()))
    .map((row, index) => ({ row: Object.assign([], row, { date: row[dateColumn] }), index: headerIndex + index + 2, platformColumns }));
  pendingRows = validateAndGroup(dataRows);
  if (!pendingRows.length) return showImportError("Não encontrei linhas de vendas válidas para o período selecionado.");
  renderPreview();
}

function showImportError(message) {
  pendingRows = [];
  const preview = document.getElementById("salesSheetPreview");
  if (preview) preview.innerHTML = `<div class="empty-state" role="alert">${escapeHtml(message)}</div>`;
  document.getElementById("salesSheetImportButton").disabled = true;
}

function validateAndGroup(sourceRows) {
  const { year, month } = parsePeriodKey(pendingPeriod);
  const monthIndex = ALL_MONTHS.indexOf(month);
  const grouped = new Map();
  const issues = [];
  sourceRows.forEach(({ row, index, platformColumns }) => {
    const parsedDate = parseDate(row.date);
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
  const text = String(value || "").trim().slice(0, 10);
  if (text.length === 10 && text[4] === "-" && text[7] === "-") {
    const [year, month, day] = text.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth ? { day, month, year } : null;
  }
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
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  let normalized = text;
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? /\./g : /,/g;
    normalized = text.replace(thousands, "").replace(decimal, ".");
  } else if (comma >= 0) {
    normalized = /,\d{3}$/.test(text)
      ? text.replace(/,/g, "")
      : text.replace(/\./g, "").replace(",", ".");
  } else if (/\.\d{3}$/.test(text)) {
    normalized = text.replace(/\./g, "");
  }
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
