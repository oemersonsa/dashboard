const MONTHS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const normalize = value => String(value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function parseSheinDate(value) {
  const match = normalize(value).match(/^(\d{1,2})\s+(?:de\s+)?([a-z]+)\s+(?:de\s+)?(\d{4})(?:\s|$)/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTHS.indexOf(match[2]) + 1;
  const year = Number(match[3]);
  return month > 0 && day > 0 && day <= new Date(year, month, 0).getDate() ? { day, month, year } : null;
}

export function isSheinExport(headers) {
  const names = headers.map(normalize);
  return names.includes("shein-sku") && names.includes("numero do pedido") && names.includes("preco do produto");
}

// A exportação contém itens; pedidos são contados uma vez por identificador.
export function groupSheinOrders(headers, rows) {
  const names = headers.map(normalize);
  const column = name => names.indexOf(name);
  const idColumn = column("numero do pedido");
  const dateColumn = column("data e hora de criacao do pedido");
  const priceColumn = column("preco do produto");
  const quantityColumn = column("numero de artigos vendidos");
  const statusColumn = column("status do produto");
  const orderStatusColumn = column("status do pedido");
  if ([idColumn, dateColumn, priceColumn, quantityColumn, orderStatusColumn].some(index => index < 0)) {
    throw new Error("A exportação da Shein não contém todas as colunas de pedido, data, preço, quantidade e status.");
  }
  const number = value => {
    if (typeof value === "number") return value;
    const text = String(value ?? "").trim().replace(/R\$|\s/g, "");
    return Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
  };
  const days = new Map();
  rows.forEach((row, index) => {
    if (!row.some(value => String(value ?? "").trim())) return;
    const date = parseSheinDate(row[dateColumn]);
    const id = String(row[idColumn] ?? "").trim();
    const price = number(row[priceColumn]);
    const quantity = number(row[quantityColumn]);
    if (!date || !id || !Number.isFinite(price) || price < 0 || !Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(`Linha ${index + 3}: pedido da Shein com data, preço ou quantidade inválidos.`);
    }
    const key = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
    if (!days.has(key)) days.set(key, { gross: 0, orders: new Set(), returns: 0, cancelled: 0 });
    const day = days.get(key);
    const amount = Math.round(price * quantity * 100);
    day.gross += amount;
    day.orders.add(id);
    // O status do item permite identificar devoluções parciais de um pedido.
    const status = normalize(row[statusColumn] || row[orderStatusColumn]);
    if (/cancel/.test(status)) day.cancelled += amount;
    else if (/reembols|devolv|refund|returned/.test(status)) day.returns += amount;
  });
  return [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, day]) =>
    [date, day.gross / 100, day.orders.size, day.returns / 100, day.cancelled / 100]
  );
}
