import { parsePeriodKey } from "../../core/state.js";
import { ALL_MONTHS } from "../../core/constants.js";

export function validateBackup(payload) {
  const fail = message => { throw new Error(message); };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail("O arquivo não contém um backup válido.");
  if (payload.version !== undefined && ![1, 2, 3].includes(payload.version)) fail("Versão de backup não suportada.");
  const source = payload.state ?? payload;
  if (!source || !Array.isArray(source.platforms) || !source.db || typeof source.db !== "object" || Array.isArray(source.db)) fail("O backup precisa conter plataformas e histórico de vendas.");
  if (!source.platforms.length) fail("O backup não contém plataformas.");
  const keys = new Set();
  for (const p of source.platforms) {
    if (!p || typeof p.key !== "string" || !/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(p.key) || ["__proto__", "constructor", "prototype"].includes(p.key) || typeof p.name !== "string" || !p.name.trim()) fail("Plataforma inválida no backup.");
    if (keys.has(p.key)) fail("O backup contém plataformas duplicadas.");
    keys.add(p.key);
  }
  const amount = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
  let days = 0;
  for (const [period, data] of Object.entries(source.db)) {
    const { year, month } = parsePeriodKey(period);
    const index = ALL_MONTHS.indexOf(month);
    if (!/^\d{4}-/.test(period) || index < 0 || year < 2000 || year > 2100) fail("Período inválido no backup.");
    if (!data || !Array.isArray(data.days) || !data.returns || typeof data.returns !== "object" || Array.isArray(data.returns)) fail("Histórico inválido no backup.");
    const dates = new Set();
    for (const day of data.days) {
      if (!day || typeof day.d !== "string" || !/^\d{2}\/\d{2}$/.test(day.d)) fail("Data inválida no backup.");
      const [d, m] = day.d.split("/").map(Number);
      if (m !== index + 1 || d < 1 || d > new Date(year, m, 0).getDate() || dates.has(day.d)) fail("Data inválida ou duplicada no backup.");
      dates.add(day.d);
      for (const [key, value] of Object.entries(day)) {
        if (key === "d") continue;
        const orders = key.startsWith("orders_");
        if (!keys.has(orders ? key.slice(7) : key) || !amount(value) || (orders && !Number.isInteger(value))) fail("Valor de venda ou quantidade inválido no backup.");
      }
    }
    for (const [key, value] of Object.entries(data.returns)) if (!keys.has(key) || !amount(value)) fail("Devolução inválida no backup.");
    days += data.days.length;
  }
  for (const [period, goal] of Object.entries(source.goals || {})) {
    const target = goal?.target ?? goal;
    if (!amount(target) || !/^\d{4}-/.test(period) || ALL_MONTHS.indexOf(parsePeriodKey(period).month) < 0) fail("Meta inválida no backup.");
  }
  if (source.currentMonth && (!/^\d{4}-/.test(source.currentMonth) || ALL_MONTHS.indexOf(parsePeriodKey(source.currentMonth).month) < 0)) fail("Período atual inválido no backup.");
  return { source, summary: `${source.platforms.length} plataforma(s), ${Object.keys(source.db).length} período(s) e ${days} dia(s) de vendas.` };
}
