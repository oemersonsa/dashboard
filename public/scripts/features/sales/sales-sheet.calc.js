import { groupSheinOrders, isSheinExport, parseSheinDate } from "./shein-import.calc.js";
import { groupMercadoLivreOrders, isMercadoLivreExport } from "./mercado-livre-import.calc.js";
const normalize = value => String(value || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function findTable(matrices, platforms, sourcePlatformKey = "", sheetName) {
  const tables = [];
  for (const name of sheetName ? [sheetName] : Object.keys(matrices)) {
    const matrix = matrices[name];
    const candidates = matrix.slice(0, 30).map((row, index) => ({
      index,
      row,
      score: row.reduce((score, cell) => {
        const header = normalize(cell);
        return score + (/data|date|dia|venda|valor|faturamento|pedido|order|sales|amount/.test(header) ? 1 : 0);
      }, 0) + (() => {
        const dateColumn = row.findIndex(cell => /^(data|date|dia)(\s|$)/.test(normalize(cell)));
        return dateColumn < 0 ? 0 : matrix.slice(index + 1, index + 11).filter(next => parseDate(next[dateColumn])).length * 100;
      })()
    })).filter((item) => item.row.filter((cell) => String(cell || "").trim()).length >= 2);
    const candidate = candidates.sort((a, b) => b.score - a.score)[0];
    const index = candidate?.index ?? -1;
    if (index >= 0 && matrix.length > index + 1) {
      const headers = matrix[index].map((cell, column) => String(cell || "").trim() || `Coluna ${column + 1}`);
      const marketplace = isSheinExport(headers) ? "shein" : isMercadoLivreExport(headers) ? "mercado livre" : "";
      if (marketplace) {
        const matches = platforms.filter(platform => !platform.archived && normalize(platform.name).includes(marketplace));
        if (!matches.length) throw new Error(`Cadastre uma plataforma ${marketplace === "shein" ? "Shein" : "Mercado Livre"} para importar esta exportação.`);
        const platform = matches.find(item => item.key === sourcePlatformKey) || matches.find(item => normalize(item.name) === marketplace) || matches[0];
        const platformName = platform.name;
        const groupedHeaders = ["Data", `${platformName} vendas brutas`, `${platformName} pedidos`, `${platformName} devoluções`, `${platformName} cancelamentos`];
        const details = marketplace === "shein" ? { rows: groupSheinOrders(headers, matrix.slice(index + 1)) } : groupMercadoLivreOrders(headers, matrix.slice(index + 1), index + 2);
        tables.push({ matrix: [groupedHeaders, ...details.rows], headers: groupedHeaders, headerIndex: 0, name, score: candidate.score, marketplace, platformKey: platform.key, details });
      } else {
        tables.push({ matrix, headers, headerIndex: index, name, score: candidate.score });
      }
    }
  }
  if (tables.length) return tables.sort((a, b) => b.score - a.score)[0];
  throw new Error("Não encontrei uma tabela com cabeçalho e linhas de dados.");
}

export function parseDate(value) {
  const sheinDate = parseSheinDate(value);
  if (sheinDate) return sheinDate;
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
