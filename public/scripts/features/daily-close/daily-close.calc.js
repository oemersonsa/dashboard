// public/scripts/features/daily-close/daily-close.calc.js
import { R } from "../../core/format.js";

export function parseDailyCloseValues(raw) {
  const r = String(raw || "").trim();
  if (!r) return 0;
  const ms = r.match(/-?\d+(?:[.,]\d{3})*(?:[.,]\d{1,2})?|-?\d+(?:[.,]\d+)?/g) || [];
  return ms.reduce((s, t) => {
    const c = t.trim();
    const lc = c.lastIndexOf(",");
    const ld = c.lastIndexOf(".");
    const ds = lc > ld ? "," : ".";
    let n = c;
    if (lc >= 0 && ld >= 0) {
      n = c.replace(new RegExp(`\\${ds === "," ? "." : ","}`, "g"), "").replace(ds, ".");
    } else if (lc >= 0) {
      n = c.replace(/\./g, "").replace(",", ".");
    } else {
      const p = c.split(".");
      if (p.length > 2) n = p.join("");
    }
    const v = Number(n);
    return Number.isFinite(v) ? s + v : s;
  }, 0);
}

export function buildDailyCloseReport(entries) {
  const ae = entries.filter(({ sales, returns }) => sales !== 0 || returns !== 0);
  const blocks = ae.map(({ platform, sales, returns }) => [
    `*Total ${platform.name}*`, "*_Vendas_*", `*${R(sales)}*`, "*_Devoluções_*", `*${R(returns)}*`, "==================="
  ].join("\n"));

  const st = ae.reduce((s, i) => s + i.sales, 0);
  const rt = ae.reduce((s, i) => s + i.returns, 0);
  const nt = st - rt;
  const tb = `*TOTAL:*\n*_Vendas_*: *${R(st)}*\n*_Devoluções_*: *${R(rt)}*\n*_Total_*: *${R(nt)}*`;

  return blocks.length ? `${blocks.join("\n")}\n${tb}` : tb;
}