import { state, parsePeriodKey, getPeriodLabel, saveState } from "../../core/state.js";
import { escapeHtml, escapeAttribute, R } from "../../core/format.js";
import { toastError, toastSuccess } from "../../ui/toast.js";
import { openModal, closeModal } from "../../ui/modal.js";
import { ALL_MONTHS } from "../../core/constants.js";
import { renderAll } from "./sales.ui.js";
import { parseDate } from "./sales-sheet.calc.js";

let sheetWorker;
let fileGeneration = 0;
let selectionGeneration = 0;
let workerSequence = 0;
window.addEventListener("dashboard:modal-closed", event => {
  if (event.detail.id === "salesSheetImportModal") { ++fileGeneration; ++selectionGeneration; stopWorker(); }
});
const workerRequests = new Map();
function stopWorker() {
  sheetWorker?.terminate(); sheetWorker = null;
  workerRequests.forEach(({ reject }) => reject(new Error("Leitura cancelada"))); workerRequests.clear();
}
function readInWorker(type, data, transfer = []) {
  if (!sheetWorker) {
    sheetWorker = new Worker("/scripts/features/sales/sales-sheet.worker.js");
    sheetWorker.onmessage = ({ data }) => {
      if (data.progress) { const preview = document.getElementById("salesSheetPreview"); if (preview) preview.textContent = data.progress; return; }
      const request = workerRequests.get(data.id);
      if (!request) return; workerRequests.delete(data.id);
      if (data.error) request.reject(new Error(data.error)); else request.resolve(data.result);
    };
    sheetWorker.onerror = () => stopWorker();
  }
  const id = ++workerSequence;
  return new Promise((resolve, reject) => { workerRequests.set(id, { resolve, reject }); sheetWorker.postMessage({ id, type, ...data }, transfer); });
}
let bound = false;
let pendingRows = [];
let pendingPeriod = "";
let sourceMatrix = [];
let sourceHeaders = [];
let headerIndex = 0;

let sourceSheet = "";
let sourceMarketplace = "";
let sourcePlatformKey = "";
let sourceImportDetails = null;

export function init() {
  if (bound) return;
  bound = true;
  document.getElementById("salesSheetFileInput")?.addEventListener("change", handleFile);
  document.getElementById("salesSheetImportButton")?.addEventListener("click", applyImport);
  document.getElementById("salesImportSheet")?.addEventListener("change", event => {
    selectSheet(event.target.value);
  });
  document.getElementById("salesImportPeriod")?.addEventListener("change", event => {
    pendingPeriod = event.target.value;
    document.getElementById("salesSheetPeriod").textContent = getPeriodLabel(pendingPeriod);
    pendingRows = [];
    clearPreview();
  });
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
  ++fileGeneration; stopWorker();
  sourceSheet = "";
  sourcePlatformKey = "";
  sourceMarketplace = "";
  document.getElementById("salesSheetFileInput").value = "";
  document.getElementById("salesImportSource").hidden = true;
  document.getElementById("salesImportMapping").hidden = true;
  pendingPeriod = state.currentMonth;
  clearPreview();
  const period = document.getElementById("salesSheetPeriod");
  if (period) period.textContent = getPeriodLabel(pendingPeriod);
  openModal("salesSheetImportModal");
}

async function handleFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const generation = ++fileGeneration; stopWorker();
  pendingRows = [];
  sourceMatrix = [];
  sourceHeaders = [];
  sourcePlatformKey = "";
  document.getElementById("salesImportSource").hidden = true;
  const mapping = document.getElementById("salesImportMapping");
  if (mapping) { mapping.hidden = true; mapping.replaceChildren(); }
  document.getElementById("salesSheetImportButton").disabled = true;
  const status = document.getElementById("salesSheetPreview");
  if (status) status.innerHTML = '<p class="card-sub">Lendo planilha…</p>';
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error("O arquivo deve ter no máximo 10 MB.");
    const buffer = await file.arrayBuffer();
    const parsed = await readInWorker("read", { buffer, platforms: state.platforms }, [buffer]);
    if (generation !== fileGeneration) return;
    const sheetSelect = document.getElementById("salesImportSheet");
    sheetSelect.innerHTML = parsed.sheets.map(name => `<option value="${escapeAttribute(name)}">${escapeHtml(name)}</option>`).join("");
    sheetSelect.value = parsed.table.name;
    document.getElementById("salesImportSource").hidden = false;
    await selectSheet(parsed.table.name, parsed.table);
  } catch (error) {
    if (generation !== fileGeneration) return;
    pendingRows = [];
    clearPreview();
    if (status) status.innerHTML = `<div class="empty-state" role="alert">${escapeHtml(error.message || "Não foi possível ler a planilha.")}</div>`;
  }
}

async function selectSheet(name, prepared) {
  const selection = ++selectionGeneration;
  pendingRows = [];
  document.getElementById("salesSheetImportButton").disabled = true;
  try {
    const parsed = prepared || await readInWorker("select", { name, platforms: state.platforms, platformKey: sourcePlatformKey });
    if (selection !== selectionGeneration) return;
    sourceSheet = name;
    sourceMarketplace = parsed.marketplace || "";
    sourcePlatformKey = parsed.platformKey || "";
    sourceImportDetails = parsed.details || null;
    sourceMatrix = parsed.matrix;
    sourceHeaders = parsed.headers;
    headerIndex = parsed.headerIndex;
    if (sourceMarketplace && sourceMatrix.length > 1) {
      const date = parseDate(sourceMatrix[sourceMatrix.length - 1][0]);
      pendingPeriod = `${date.year}-${ALL_MONTHS[date.month - 1]}`;
      document.getElementById("salesSheetPeriod").textContent = getPeriodLabel(pendingPeriod);
    }
    const periods = new Set([pendingPeriod, ...Object.keys(state.db)]);
    const dateColumn = sourceHeaders.findIndex(header => /^(data|date|dia)(\s|$)/.test(normalize(header)));
    sourceMatrix.slice(headerIndex + 1).forEach(row => {
      const date = parseDate(row[dateColumn]);
      if (date?.year) periods.add(`${date.year}-${ALL_MONTHS[date.month - 1]}`);
    });
    document.getElementById("salesImportPeriod").innerHTML = [...periods].sort().map(period => `<option value="${escapeAttribute(period)}">${escapeHtml(getPeriodLabel(period))}</option>`).join("");
    document.getElementById("salesImportPeriod").value = pendingPeriod;
    renderMapping();
  } catch (error) {
    document.getElementById("salesImportMapping").hidden = true;
    showImportError(error.message);
  }
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
      if (sourceMarketplace && platform.key !== sourcePlatformKey) return false;
      if (sourceImportDetails?.missingRefunds > 0 && (kind === "returns" || kind === "cancelled")) return false;
      const shopeePlatforms = state.platforms.filter(item => !item.archived && normalize(item.name).includes("shopee"));
      if (shopeePlatforms.length === 1 && platform === shopeePlatforms[0] && /pedido feito|produto pago/i.test(sourceSheet)) {
        return kind === "sales" ? /^vendas\s*\(brl\)$/.test(h) : kind === "orders" ? h === "pedidos" : kind === "cancelled" ? /^(vendas|valor).*cancel/.test(h) : /^(vendas|valor).*devolv|^(vendas|valor).*reembols/.test(h);
      }
      return h.includes(platformMatch) && (kind === "cancelled" ? /cancel/.test(h) && !/pedido|order|quantidade/.test(h) : kind === "returns" ? /devol|reembols|refund/.test(h) && !/pedido|order|quantidade/.test(h) : kind === "sales" ? /venda|valor|faturamento|total|sales|amount/.test(h) && !/devol|reembols|cancel|refund/.test(h) : /pedido|order|quantidade/.test(h) && !/devol|reembols|cancel|refund/.test(h));
    });
    return `<div class="sales-import-map-row"><strong>${escapeHtml(platform.name)}</strong><label class="fg"><span class="flabel">Vendas</span><select class="finput" data-map-platform="${escapeAttribute(platform.key)}" data-map-kind="sales"><option value="">Não importar</option>${sourceHeaders.map((header, index) => `<option value="${index}" ${index === guess("sales") ? "selected" : ""}>${escapeHtml(header)}</option>`).join("")}</select></label><label class="fg"><span class="flabel">Pedidos</span><select class="finput" data-map-platform="${escapeAttribute(platform.key)}" data-map-kind="orders">${options(guess("orders"), true)}</select></label><label class="fg"><span class="flabel">Devoluções (R$)</span><select class="finput" data-map-platform="${escapeAttribute(platform.key)}" data-map-kind="returns">${options(guess("returns"), true)}</select></label><label class="fg"><span class="flabel">Cancelamentos (R$)</span><select class="finput" data-map-platform="${escapeAttribute(platform.key)}" data-map-kind="cancelled">${options(guess("cancelled"), true)}</select></label></div>`;
  }).join("");
  el.hidden = false;
  el.innerHTML = `<div class="sales-import-map-row"><strong>Data do lançamento</strong><label class="fg"><span class="flabel">Coluna de data</span><select class="finput" id="salesImportDateColumn">${sourceHeaders.map((header, index) => `<option value="${index}" ${index === guessedDate ? "selected" : ""}>${escapeHtml(header)}</option>`).join("")}</select></label></div>${rows}<button class="btn btn-secondary" id="salesImportPreviewButton" type="button">Conferir dados</button>`;
  if (sourceMarketplace) {
    const platforms = state.platforms.filter(platform => !platform.archived && normalize(platform.name).includes(sourceMarketplace));
    el.insertAdjacentHTML("afterbegin", `<label class="fg"><span class="flabel">Plataforma de destino desta exportação</span><select class="finput" id="salesImportPlatform">${platforms.map(platform => `<option value="${escapeAttribute(platform.key)}" ${platform.key === sourcePlatformKey ? "selected" : ""}>${escapeHtml(platform.name)}</option>`).join("")}</select></label>`);
    document.getElementById("salesImportPlatform").addEventListener("change", event => {
      sourcePlatformKey = event.target.value;
      selectSheet(sourceSheet);
    });
  }
  if (sourceImportDetails?.missingRefunds > 0) {
    el.insertAdjacentHTML("afterbegin", `<p class="card-sub" role="alert">O relatório tem ${sourceImportDetails.missingRefunds} linha(s) com status de cancelamento/devolução sem valor de reembolso. Devoluções e cancelamentos ficaram em “Não importar” para preservar seus totais atuais. Se mapear essas colunas, somente os valores preenchidos serão somados; o total estará incompleto.</p>`);
  }
  document.getElementById("salesImportPreviewButton")?.addEventListener("click", () => {
    void buildPreview().catch(error => showImportError(error.message));
  });
  document.getElementById("salesSheetImportButton").disabled = true;
  const preview = document.getElementById("salesSheetPreview");
  if (preview) preview.innerHTML = '<p class="card-sub">Associe as colunas e selecione “Conferir dados”.</p>';
}

async function buildPreview() {
  await window.dashboard.ensureHistory([pendingPeriod]);
  const dateColumn = Number(document.getElementById("salesImportDateColumn")?.value);
  const platformColumns = [];
  document.querySelectorAll("[data-map-platform]").forEach((select) => {
    const entry = platformColumns.find((item) => item.key === select.dataset.mapPlatform)
      || { key: select.dataset.mapPlatform, sales: null, orders: null, returns: null, cancelled: null };
    const raw = select.value;
    entry[select.dataset.mapKind] = raw === "" ? null : Number(raw);
    if (!platformColumns.includes(entry)) platformColumns.push(entry);
  });
  if (!platformColumns.some((item) => item.sales !== null || item.orders !== null || item.returns !== null || item.cancelled !== null)) {
    return showImportError("Associe pelo menos uma coluna de vendas, pedidos, devoluções ou cancelamentos.");
  }
  const dataRows = sourceMatrix.slice(headerIndex + 1).filter((row) => row.some((cell) => String(cell || "").trim()))
    .filter(row => {
      if (!sourceMarketplace) return true;
      const date = parseDate(row[dateColumn]);
      const period = parsePeriodKey(pendingPeriod);
      return date && date.year === period.year && date.month === ALL_MONTHS.indexOf(period.month) + 1;
    })
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
    platformColumns.forEach(({ key, sales, orders, returns, cancelled }) => {
      const amount = sales === null ? 0 : parseNumber(row[sales]);
      const count = orders === null ? 0 : parseNumber(row[orders]);
      const returned = returns === null ? 0 : parseNumber(row[returns]);
      const cancelledAmount = cancelled === null ? 0 : parseNumber(row[cancelled]);
      if (!Number.isFinite(cancelledAmount) || cancelledAmount < 0 || !Number.isFinite(returned) || returned < 0 || !Number.isFinite(amount) || !Number.isFinite(count) || amount < 0 || count < 0) {
        issues.push(`Linha ${index}: venda, pedidos ou devoluções com valor inválido.`);
        return;
      }
      if (sales !== null || orders !== null || returns !== null || cancelled !== null) {
        if (!target[key]) target[key] = { amount: 0, orders: 0, returns: 0, cancelled: 0, hasSales: sales !== null, hasOrders: orders !== null, hasReturns: returns !== null || cancelled !== null };
        target[key].amount += amount;
        target[key].orders += Math.round(count);
        target[key].returns += returned + cancelledAmount;
        target[key].cancelled += cancelledAmount;
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
  const values = pendingRows.flatMap(row => Object.values(row.values));
  const returnKeys = [...new Set(pendingRows.flatMap(row => Object.entries(row.values).filter(([,value]) => value.hasReturns).map(([key]) => key)))];
  const returnConflicts = returnKeys.filter(key => Number(state.db[pendingPeriod]?.returns?.[key] || 0) > 0).length;
  el.innerHTML = `<div class="sales-import-summary" role="status"><strong>${pendingRows.length} dias encontrados</strong><span>${cells} combinações de plataforma/dia${conflicts ? ` · ${conflicts} já têm dados` : " · nenhum conflito encontrado"}</span><span>Vendas: ${R(values.reduce((sum, value) => sum + value.amount, 0))} · Pedidos: ${values.reduce((sum, value) => sum + value.orders, 0)} · Devoluções totais: ${values.some(value => value.hasReturns) ? R(values.reduce((sum, value) => sum + value.returns, 0)) : "Não importar"}</span>${values.some(value => value.hasReturns) ? `<span>Cancelamentos: ${R(values.reduce((sum, value) => sum + value.cancelled, 0))} · Devolvidos/reembolsados: ${R(values.reduce((sum, value) => sum + value.returns - value.cancelled, 0))}</span>` : ""}${returnConflicts ? `<span>${returnConflicts} plataforma(s) já têm devoluções no mês; escolha substituir se quiser atualizar esses totais.</span>` : ""}<span>Aba: ${escapeHtml(sourceSheet)} · Destino: ${escapeHtml(getPeriodLabel(pendingPeriod))}</span><span>Devoluções do mês = vendas canceladas + vendas devolvidas/reembolsadas. A soma não altera as vendas brutas nem a quantidade de pedidos. Valores existentes são preservados no modo “Ignorar”.</span></div>
    <div class="sales-import-table-wrap"><table class="sales-import-table"><thead><tr><th>Data</th><th>Plataformas com dados</th><th>Conflitos</th></tr></thead><tbody>${pendingRows.slice(0, 8).map((row) => {
      const keys = Object.keys(row.values);
      const conflictsHere = keys.filter((key) => {
        const existing = state.db[pendingPeriod]?.days?.find((day) => day.d === row.d);
        return Number(existing?.[key] || 0) > 0 || Number(existing?.[`orders_${key}`] || 0) > 0;
      });
      return `<tr><td>${escapeHtml(row.d)}</td><td>${keys.length}</td><td>${conflictsHere.length ? `${conflictsHere.length} existente(s)` : "—"}</td></tr>`;
    }).join("")}</tbody></table>${pendingRows.length > 8 ? `<div class="card-sub">Prévia das primeiras 8 datas.</div>` : ""}</div>`;
  if (button) button.disabled = false;
  if (sourceMarketplace === "shein") el.insertAdjacentHTML("afterbegin", '<p class="card-sub">Shein: somente pedidos do mês selecionado. Vendas brutas = preço do produto × quantidade, antes de cupons, descontos, comissões e taxas. Pedidos contados uma vez por número; devoluções e cancelamentos identificados pelo status do item.</p>');
  if (sourceMarketplace === "mercado livre") el.insertAdjacentHTML("afterbegin", `<p class="card-sub">Mercado Livre: somente vendas do mês selecionado. Vendas brutas usam “Receita por produtos (BRL)” ou, quando ausente, preço unitário × unidades (${sourceImportDetails.estimatedSales} linha(s) no arquivo). Resumos de pacotes e linhas sem produto foram ignorados (${sourceImportDetails.skippedRows}). Reembolsos usam somente “Cancelamentos e reembolsos (BRL)”, em valor absoluto. Valores ausentes não foram estimados.</p>`);
}

async function applyImport() {
  try { await window.dashboard.ensureHistory([pendingPeriod]); } catch (error) { return toastError(error.message); }
  if (!pendingRows.length) return;
  const replace = document.querySelector('[data-sales-import-mode="replace"].active');
  let added = 0;
  let skipped = 0;
  const month = state.db[pendingPeriod] || (state.db[pendingPeriod] = { days: [], returns: {} });
  month.returns ||= {};
  const monthlyReturns = {};
  pendingRows.forEach(row => Object.entries(row.values).forEach(([key, value]) => {
    if (value.hasReturns) monthlyReturns[key] = (monthlyReturns[key] || 0) + value.returns;
  }));
  pendingRows.forEach((row) => {
    if (!Object.values(row.values).some(value => value.hasSales || value.hasOrders)) return;
    let day = month.days.find((item) => item.d === row.d);
    if (!day) {
      day = { d: row.d };
      state.platforms.forEach((platform) => { day[platform.key] = 0; day[`orders_${platform.key}`] = 0; });
      month.days.push(day);
    }
    Object.entries(row.values).forEach(([key, value]) => {
      if (!value.hasSales && !value.hasOrders) return;
      const hasExisting = Number(day[key] || 0) > 0 || Number(day[`orders_${key}`] || 0) > 0;
      if (hasExisting && !replace) { skipped++; return; }
      if (value.hasSales) day[key] = value.amount;
      if (value.hasOrders) day[`orders_${key}`] = value.orders;
      added++;
    });
  });
  let returnsUpdated = 0;
  Object.entries(monthlyReturns).forEach(([key, amount]) => {
    if (Number(month.returns[key] || 0) > 0 && !replace) { skipped++; return; }
    month.returns[key] = Math.round(amount * 100) / 100;
    returnsUpdated++;
  });
  month.days.sort((a, b) => Number(a.d.slice(0, 2)) - Number(b.d.slice(0, 2)));
  saveState();
  if (state.currentMonth === pendingPeriod) renderAll();
  closeModal("salesSheetImportModal");
  toastSuccess(`Importação concluída: ${added} combinações atualizadas; ${returnsUpdated} total(is) de devoluções registrado(s)${skipped ? `; ${skipped} duplicadas ignoradas` : ""}.`);
  pendingRows = [];
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
