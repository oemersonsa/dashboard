import { loadSheets as loadSheetJs } from "../../core/libraries.js";
/* ═══════════════════════════════════════════════════════════════
   features/reports/report.export.js
   Exportação do relatório em CSV e Excel (XLSX)
   - buildReportRows(month, state): função pura, retorna
     { summary: [...], daily: [...], meta: {...} }
   - toCsv(rows): função pura, gera CSV pt-BR (; e vírgula decimal)
   - downloadCsv(rows, filename): efeito colateral (Blob + download)
   - downloadXlsx(rows, filename): carrega SheetJS sob demanda
   ═══════════════════════════════════════════════════════════════ */

import { R } from "../../core/format.js";
import { getPeriodLabel } from "../../core/state.js";
import { calcTotals, getComparisonPeriod } from "../sales/sales.calc.js";
import { slugify } from "../../core/format.js";

/* ═══ Número formatado pt-BR para CSV (sem símbolo) ═══ */
export function toCsvNumber(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0,00";
  return n.toFixed(2).replace(".", ",");
}

/* ═══ Escape de campo CSV ═══ */
export function escapeCsvField(value) {
  const s = String(value ?? "");
  // Se contém ; " \n \r ou vírgula, envolve em aspas e dobra aspas internas
  if (/[;"\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/* ═══ Constrói linhas do relatório (puro) ═══ */
export function buildReportRows(month, stateData) {
  const state = stateData || { platforms: [], db: {} };
  const comp = getComparisonPeriod(month);
  const t = comp.currentTotals || { sales: {}, ret: {}, gross: 0, totalRet: 0, net: 0, orders: 0 };
  const pt = comp.previousTotals;
  const pn = comp.previousName;
  const pl = pn ? getPeriodLabel(pn) : "";

  const platforms = (state.platforms || []).filter(
    (p) => (t.sales?.[p.key] || 0) > 0 || (t.ret?.[p.key] || 0) > 0
  );

  /* ─── Resumo por plataforma ─── */
  const summaryHeader = [
    "Plataforma",
    "Vendas",
    "Devoluções",
    "% Devolução",
    "Após devoluções",
    `Vendas ${pl || "mês anterior"}`,
    "Variação %"
  ];

  const summaryRows = platforms.map((p) => {
    const v = Number(t.sales[p.key] || 0);
    const r = Number(t.ret[p.key] || 0);
    const net = Math.max(0, v - r);
    const prev = pt ? Math.max(0, Number(pt.sales[p.key] || 0) - Number(pt.ret[p.key] || 0)) : null;
    const variation = prev && prev > 0 ? ((net - prev) / prev) * 100 : null;

    return [
      p.name,
      toCsvNumber(v),
      toCsvNumber(r),
      v > 0 ? ((r / v) * 100).toFixed(2).replace(".", ",") + "%" : "0,00%",
      toCsvNumber(net),
      prev !== null ? toCsvNumber(prev) : "",
      variation !== null ? ((variation >= 0 ? "+" : "") + variation.toFixed(2).replace(".", ",") + "%") : ""
    ];
  });

  const totalRow = [
    "TOTAL",
    toCsvNumber(t.gross),
    toCsvNumber(t.totalRet),
    t.gross > 0 ? ((t.totalRet / t.gross) * 100).toFixed(2).replace(".", ",") + "%" : "0,00%",
    toCsvNumber(t.net),
    pt ? toCsvNumber(pt.net) : "",
    pt && pt.net > 0 ? (((t.net - pt.net) / pt.net) * 100).toFixed(2).replace(".", ",") + "%" : ""
  ];

  /* ─── Vendas diárias ─── */
  const data = state.db?.[month];
  const dailyHeader = ["Data"];
  platforms.forEach((p) => {
    dailyHeader.push(`${p.name} - Vendas`);
    dailyHeader.push(`${p.name} - Pedidos`);
  });
  dailyHeader.push("Total do dia");

  const dailyRows = (data?.days || []).map((d) => {
    const row = [d.d];
    let dayTotal = 0;
    platforms.forEach((p) => {
      const v = Number(d[p.key] || 0);
      const o = Math.max(0, Math.round(Number(d[`orders_${p.key}`] || 0)));
      row.push(toCsvNumber(v));
      row.push(String(o));
      dayTotal += v;
    });
    row.push(toCsvNumber(dayTotal));
    return row;
  });

  const meta = {
    month,
    monthLabel: getPeriodLabel(month),
    previousLabel: pl,
    generatedAt: new Date().toISOString()
  };

  return {
    summary: [summaryHeader, ...summaryRows, totalRow],
    daily: [dailyHeader, ...dailyRows],
    meta
  };
}

/* ═══ CSV (puro) ═══ */
export function toCsv(reportRows) {
  const lines = [];

  // Cabeçalho informativo
  lines.push(`Relatório;${escapeCsvField(reportRows.meta.monthLabel)}`);
  lines.push(`Gerado em;${escapeCsvField(new Date(reportRows.meta.generatedAt).toLocaleString("pt-BR"))}`);
  if (reportRows.meta.previousLabel) {
    lines.push(`Comparação;${escapeCsvField(reportRows.meta.previousLabel)}`);
  }
  lines.push("");

  // Seção Resumo
  lines.push("RESUMO POR PLATAFORMA");
  reportRows.summary.forEach((row) => {
    lines.push(row.map(escapeCsvField).join(";"));
  });
  lines.push("");

  // Seção Diário
  lines.push("VENDAS DIÁRIAS");
  reportRows.daily.forEach((row) => {
    lines.push(row.map(escapeCsvField).join(";"));
  });

  return "\uFEFF" + lines.join("\r\n");   // BOM + CRLF
}

/* ═══ SheetJS — carregamento sob demanda ═══ */
/* ═══ Download de arquivo (efeito colateral) ═══ */
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/* ═══ CSV ═══ */
export function downloadCsv(reportRows, filenameBase) {
  const csv = toCsv(reportRows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, `${slugify(filenameBase)}.csv`);
}

/* ═══ Excel (.xlsx) ═══ */
export async function downloadXlsx(reportRows, filenameBase) {
  const XLSX = await loadSheetJs();

  const wb = XLSX.utils.book_new();

  // ─── Aba Resumo ───
  const wsSummary = XLSX.utils.aoa_to_sheet(reportRows.summary);
  // Converte colunas numéricas (a partir da coluna B) para Number
  for (let r = 1; r < reportRows.summary.length; r++) {
    for (let c = 1; c <= 5; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      const cell = wsSummary[cellRef];
      if (cell && typeof cell.v === "string") {
        const num = parseFloat(cell.v.replace(/\./g, "").replace(",", "."));
        if (Number.isFinite(num)) {
          cell.v = num;
          cell.t = "n";
          cell.z = '"R$" #,##0.00';
        }
      }
    }
  }
  wsSummary["!cols"] = [
    { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
    { wch: 16 }, { wch: 16 }, { wch: 12 }
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo");

  // ─── Aba Diário ───
  const wsDaily = XLSX.utils.aoa_to_sheet(reportRows.daily);
  for (let r = 1; r < reportRows.daily.length; r++) {
    for (let c = 1; c < reportRows.daily[0].length; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      const cell = wsDaily[cellRef];
      if (cell && typeof cell.v === "string") {
        const num = parseFloat(cell.v.replace(/\./g, "").replace(",", "."));
        if (Number.isFinite(num)) {
          cell.v = num;
          cell.t = "n";
        }
      }
    }
  }
  wsDaily["!cols"] = [{ wch: 10 }, ...reportRows.daily[0].slice(1).map(() => ({ wch: 12 }))];
  XLSX.utils.book_append_sheet(wb, wsDaily, "Diário");

  // Gera e faz o download
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  triggerDownload(blob, `${slugify(filenameBase)}.xlsx`);
}

/* ═══ Exportações de alto nível ═══ */
export async function exportReportCsv(month, stateData) {
  const rows = buildReportRows(month, stateData);
  const base = `relatorio-${slugify(month)}`;
  downloadCsv(rows, base);
  return rows;
}

export async function exportReportXlsx(month, stateData) {
  const rows = buildReportRows(month, stateData);
  const base = `relatorio-${slugify(month)}`;
  await downloadXlsx(rows, base);
  return rows;
}