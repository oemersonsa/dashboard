const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
function invalid() { const e = new Error("invalid_business_data"); e.statusCode = 400; e.code = "invalid_business_data"; throw e; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value); }
function period(value) {
  const match = /^(\d{4})-(.+)$/.exec(value);
  // O app e backups históricos usam "Marco"; também aceitamos "Março".
  const year = Number(match?.[1]); const month = MONTHS.indexOf(match?.[2] === "Marco" ? "Março" : match?.[2]);
  if (!match || year < 2000 || year > 2100 || month < 0) invalid();
  return { year, month };
}
function amount(value) { if (typeof value !== "number" || !Number.isFinite(value) || value < 0) invalid(); }
function validateMonth(month, data, keys) {
  const parsed = period(month);
  if (!object(data) || !Array.isArray(data.days) || !object(data.returns)) invalid();
  const dates = new Set();
  for (const day of data.days) {
    if (!object(day) || typeof day.d !== "string" || !/^\d{2}\/\d{2}$/.test(day.d)) invalid();
    const [d, m] = day.d.split("/").map(Number);
    if (m !== parsed.month + 1 || d < 1 || d > new Date(parsed.year, m, 0).getDate() || dates.has(day.d)) invalid();
    dates.add(day.d);
    for (const [key, value] of Object.entries(day)) {
      if (key === "d") continue;
      const orders = key.startsWith("orders_");
      if (!keys.has(orders ? key.slice(7) : key)) invalid();
      amount(value); if (orders && !Number.isInteger(value)) invalid();
    }
  }
  for (const [key, value] of Object.entries(data.returns)) { if (!keys.has(key)) invalid(); amount(value); }
}
function validateBusiness(state) {
  if (!object(state) || !Array.isArray(state.platforms) || !object(state.db)) invalid();
  const keys = new Set();
  for (const p of state.platforms) {
    if (!object(p) || typeof p.key !== "string" || !/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(p.key) || ["__proto__", "constructor", "prototype"].includes(p.key) || typeof p.name !== "string" || !p.name.trim() || keys.has(p.key)) invalid();
    keys.add(p.key);
  }
  for (const [month, data] of Object.entries(state.db)) validateMonth(month, data, keys);
  for (const [month, goal] of Object.entries(state.goals || {})) { period(month); amount(goal?.target ?? goal); }
  if (state.currentMonth) period(state.currentMonth);
}
module.exports = { validateBusiness, validateMonth };
