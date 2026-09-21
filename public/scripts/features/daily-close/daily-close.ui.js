import { state, saveState } from "../../core/state.js";
import { R, escapeAttribute } from "../../core/format.js";
import { platformBadge } from "../../ui/icons.js";
import { toast, toastSuccess, toastError } from "../../ui/toast.js";

let bound = false;

export function init() {
  const di = document.getElementById("dailyCloseDate");
  if (di && !di.value) di.valueAsDate = new Date();
  render();
  if (!bound) { bindEvents(); bound = true; }
}

function parseValues(raw) {
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

function getEntries() {
  return state.platforms.map((p) => {
    const sales = parseValues(document.getElementById(`dailyCloseSales_${p.key}`)?.value || "");
    const returns = parseValues(document.getElementById(`dailyCloseReturns_${p.key}`)?.value || "");
    return { platform: p, sales, returns, net: sales - returns };
  });
}

function buildReport(entries) {
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

function render() {
  const g = document.getElementById("dailyClosePlatformGrid");
  if (!g) return;

  g.innerHTML = state.platforms.map((p) => `
    <article class="daily-close-platform">
      <div class="daily-close-platform-head">
        ${platformBadge(p)}
        <div class="daily-close-platform-net" id="dailyCloseNetTotal_${escapeAttribute(p.key)}">${R(0)}</div>
      </div>
      <div class="daily-close-input-grid">
        <label class="fg"><span class="flabel">Vendas</span><textarea class="finput daily-close-input" id="dailyCloseSales_${escapeAttribute(p.key)}" data-daily-close-input placeholder="3229,99 + 120,00"></textarea></label>
        <label class="fg"><span class="flabel">Devoluções</span><textarea class="finput daily-close-input" id="dailyCloseReturns_${escapeAttribute(p.key)}" data-daily-close-input placeholder="1097,18"></textarea></label>
      </div>
      <div class="daily-close-platform-totals">
        <div><span>Vendas</span><strong id="dailyCloseSalesTotal_${escapeAttribute(p.key)}">${R(0)}</strong></div>
        <div><span>Devoluções</span><strong id="dailyCloseReturnsTotal_${escapeAttribute(p.key)}">${R(0)}</strong></div>
      </div>
    </article>
  `).join("");

  updatePreview();
}

function updatePreview() {
  const entries = getEntries();
  const p = document.getElementById("dailyClosePreview");
  const t = document.getElementById("dailyCloseTotals");
  if (p) p.value = buildReport(entries);
  if (t) {
    const st = entries.reduce((s, i) => s + i.sales, 0);
    const rt = entries.reduce((s, i) => s + i.returns, 0);
    t.innerHTML = `<div><span>Vendas</span><strong>${R(st)}</strong></div><div><span>Devoluções</span><strong>${R(rt)}</strong></div><div><span>Total</span><strong>${R(st - rt)}</strong></div>`;
  }
  entries.forEach(({ platform, sales, returns, net }) => {
    const se = document.getElementById(`dailyCloseSalesTotal_${platform.key}`);
    const re = document.getElementById(`dailyCloseReturnsTotal_${platform.key}`);
    const ne = document.getElementById(`dailyCloseNetTotal_${platform.key}`);
    if (se) se.textContent = R(sales);
    if (re) re.textContent = R(returns);
    if (ne) ne.textContent = R(net);
  });
}

function bindEvents() {
  document.getElementById("dailyClosePlatformGrid")?.addEventListener("input", (e) => {
    if (e.target.closest("[data-daily-close-input]")) updatePreview();
  });
  document.getElementById("dailyCloseDate")?.addEventListener("change", updatePreview);
  document.getElementById("downloadDailyCloseButton")?.addEventListener("click", download);
  document.getElementById("copyDailyCloseButton")?.addEventListener("click", copy);
  document.getElementById("clearDailyCloseButton")?.addEventListener("click", clear);
}

function download() {
  updatePreview();
  const r = document.getElementById("dailyClosePreview")?.value || buildReport(getEntries());
  const d = document.getElementById("dailyCloseDate")?.value || new Date().toISOString().slice(0, 10);
  const b = new Blob([r], { type: "text/plain;charset=utf-8" });
  const u = URL.createObjectURL(b);
  const l = document.createElement("a");
  l.href = u;
  l.download = `fechamento-diario-${d}.txt`;
  l.click();
  URL.revokeObjectURL(u);
  toastSuccess("Relatório TXT gerado");
}

async function copy() {
  updatePreview();
  const r = document.getElementById("dailyClosePreview")?.value || buildReport(getEntries());
  try {
    await navigator.clipboard.writeText(r);
    toastSuccess("Texto copiado");
  } catch {
    document.getElementById("dailyClosePreview")?.select();
    toast("Selecione o texto para copiar");
  }
}

function clear() {
  document.querySelectorAll("[data-daily-close-input]").forEach((i) => { i.value = ""; });
  updatePreview();
  toast("Fechamento limpo");
}