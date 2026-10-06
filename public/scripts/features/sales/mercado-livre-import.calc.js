import { parseSheinDate } from "./shein-import.calc.js";

const normalize = value => String(value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const present = value => String(value ?? "").trim() !== "";

export function isMercadoLivreExport(headers) {
  const names = headers.map(normalize);
  return names.includes("data de venda") && names.includes("receita por produtos (brl)") && names.includes("preco unitario de venda do anuncio (brl)");
}

export function groupMercadoLivreOrders(headers, rows, firstRow = 8) {
  const names = headers.map(normalize);
  const idColumn = names.findIndex(name => /^(n\.?[º°]?|numero).*venda$/.test(name));
  const dateColumn = names.indexOf("data de venda");
  const unitsColumn = names.indexOf("unidades");
  const priceColumn = names.indexOf("preco unitario de venda do anuncio (brl)");
  const revenueColumn = names.indexOf("receita por produtos (brl)");
  const refundColumn = names.indexOf("cancelamentos e reembolsos (brl)");
  const statusColumn = names.indexOf("estado");
  if ([idColumn, dateColumn, unitsColumn, priceColumn, revenueColumn, refundColumn, statusColumn].some(index => index < 0)) {
    throw new Error("A exportação do Mercado Livre não contém todas as colunas de venda, data, unidades, preço e reembolso.");
  }
  const number = value => {
    if (typeof value === "number") return value;
    const text = String(value ?? "").trim().replace(/R\$|\s/g, "");
    return Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
  };
  const days = new Map();
  let missingRefunds = 0;
  let estimatedSales = 0;
  let skippedRows = 0;
  rows.forEach((row, index) => {
    if (!row.some(present)) return;
    const status = normalize(row[statusColumn]);
    // Pacotes resumem os itens seguintes; linhas sem produto também não são vendas adicionais.
    if (/^pacote de \d+ produtos?/.test(status) || (!present(row[unitsColumn]) && !present(row[priceColumn]) && !present(row[revenueColumn]) && !present(row[refundColumn]))) {
      skippedRows++;
      return;
    }
    const date = parseSheinDate(row[dateColumn]);
    const id = String(row[idColumn] ?? "").trim();
    const units = number(row[unitsColumn]);
    const price = number(row[priceColumn]);
    const hasRevenue = present(row[revenueColumn]);
    const gross = hasRevenue ? number(row[revenueColumn]) : price * units;
    const hasRefund = present(row[refundColumn]);
    const refund = hasRefund ? Math.abs(number(row[refundColumn])) : 0;
    if (!date || !id || !Number.isFinite(gross) || gross < 0 || !Number.isFinite(refund) ||
        (!hasRevenue && (!present(row[priceColumn]) || !Number.isInteger(units) || units <= 0))) {
      throw new Error(`Linha ${firstRow + index}: venda do Mercado Livre com data, preço, unidades ou reembolso inválidos.`);
    }
    if (!hasRevenue) estimatedSales++;
    // Não inferimos o valor do reembolso pelo status ou pelo preço do produto.
    if (!hasRefund && /cancel|reembols|devolu|devolvido/.test(status)) missingRefunds++;
    const key = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
    if (!days.has(key)) days.set(key, { gross: 0, orders: new Set(), returns: 0, cancelled: 0 });
    const day = days.get(key);
    day.gross += Math.round(gross * 100);
    day.orders.add(id);
    if (/cancel/.test(status)) day.cancelled += Math.round(refund * 100);
    else day.returns += Math.round(refund * 100);
  });
  return {
    rows: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, day]) => [date, day.gross / 100, day.orders.size, day.returns / 100, day.cancelled / 100]),
    missingRefunds, estimatedSales, skippedRows
  };
}
