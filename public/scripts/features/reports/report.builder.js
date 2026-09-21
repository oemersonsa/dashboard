import { state, getPeriodLabel } from "../../core/state.js";
import { R, RS, slugify } from "../../core/format.js";
import { DASH_HTML as dash } from "../../core/constants.js";
import { platformBadge } from "../../ui/icons.js";
import { openModal, closeModal } from "../../ui/modal.js";
import { calcTotals, getComparisonPeriod } from "../sales/sales.calc.js";

let bound = false;

export function init() {
  if (!bound) { bindEvents(); bound = true; }
}

export function openReport() {
  const month = state.currentMonth;
  const c = getComparisonPeriod(month);
  const t = c.currentTotals;
  const pn = c.previousName;
  const pt = c.previousTotals;
  const pl = pt && c.cutoffDay ? `${getPeriodLabel(pn)} até dia ${c.cutoffDay}` : (pn ? getPeriodLabel(pn) : "");

  const active = state.platforms.filter((p) => t.sales[p.key] > 0 || t.ret[p.key] > 0);
  const mn = pt ? Math.max(t.net, pt.net, 1) : Math.max(t.net, 1);

  const tt = document.getElementById("reportTitle");
  if (tt) tt.textContent = `Relatório - ${getPeriodLabel(month)}`;

  const rows = active.map((p) => {
    const v = t.sales[p.key] || 0;
    const r = t.ret[p.key] || 0;
    const net = Math.max(0, v - r);
    const pv = pt ? Math.max(0, (pt.sales[p.key] || 0) - (pt.ret[p.key] || 0)) : null;
    return `<tr><td>${platformBadge(p)}</td><td>${R(v)}</td><td class="neg">${r > 0 ? R(r) : "-"}</td><td style="font-size:12px;color:var(--muted)">${v > 0 ? ((r / v) * 100).toFixed(1) : 0}%</td><td style="font-weight:700">${R(net)}</td><td>${pv !== null ? varH(net, pv) : dash}</td></tr>`;
  }).join("");

  const compareRows = pt ? active.map((p) => {
    const cn = Math.max(0, (t.sales[p.key] || 0) - (t.ret[p.key] || 0));
    const pn2 = Math.max(0, (pt.sales[p.key] || 0) - (pt.ret[p.key] || 0));
    const mv = Math.max(cn, pn2, 1);
    return `<div class="pcrow"><div class="pcname">${platformBadge(p, true)}</div><div class="pcbars"><div class="pcbar-cur" style="width:${((cn / mv) * 100).toFixed(0)}%;background:${p.color}"></div><div class="pcbar-prev" style="width:${((pn2 / mv) * 100).toFixed(0)}%;background:${p.color}"></div></div><div class="pcvals"><div class="pcval-cur">${RS(cn)}</div><div class="pcval-var">${varH(cn, pn2)}</div></div></div>`;
  }).join("") : '<div style="color:var(--muted);font-size:12px;padding:10px 0">Sem mês anterior.</div>';

  const cc = document.getElementById("reportContent");
  if (!cc) return;

  cc.innerHTML = `
    <div class="rkpis">
      <div class="rkpi"><div class="rkpi-label">Vendas</div><div class="rkpi-val">${R(t.gross)}</div><div class="rkpi-sub">${pt ? varH(t.gross, pt.gross) : ""}</div></div>
      <div class="rkpi"><div class="rkpi-label">Pedidos</div><div class="rkpi-val">${t.orders}</div><div class="rkpi-sub">${t.orders > 0 ? `${RS(t.gross / t.orders)} por pedido` : "Sem pedidos"}</div></div>
      <div class="rkpi"><div class="rkpi-label">Devoluções</div><div class="rkpi-val neg">${R(t.totalRet)}</div><div class="rkpi-sub" style="color:var(--muted)">${t.gross > 0 ? ((t.totalRet / t.gross) * 100).toFixed(1) : 0}% do bruto</div></div>
      <div class="rkpi"><div class="rkpi-label">Vendas após devoluções</div><div class="rkpi-val">${R(t.net)}</div><div class="rkpi-sub">${pt ? varH(t.net, pt.net) : ""}</div></div>
    </div>
    <div class="msection">
      <div class="msec-title">Detalhamento por Plataforma</div>
      <table class="rtable"><thead><tr><th>Plataforma</th><th>Vendas</th><th>Devoluções</th><th>% Dev.</th><th>Após devoluções</th><th>vs. Mês Ant.</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td style="color:var(--accent)">Total</td><td>${R(t.gross)}</td><td class="neg">${R(t.totalRet)}</td><td style="color:var(--muted)">${t.gross > 0 ? ((t.totalRet / t.gross) * 100).toFixed(1) : 0}%</td><td style="color:var(--accent)">${R(t.net)}</td><td>${pt ? varH(t.net, pt.net) : "-"}</td></tr></tfoot></table>
    </div>
    ${pt ? `<div class="msection">
      <div class="msec-title">Comparativo Visual - ${getPeriodLabel(month)} vs ${pl}</div>
      <div class="cvis">
        <div class="cvis-item"><div class="cvis-month">${getPeriodLabel(month)}</div><div class="cvis-val" style="color:var(--accent)">${R(t.net)}</div><div style="font-size:11px;color:var(--muted);margin-bottom:6px">Bruto: ${R(t.gross)} · Dev: ${R(t.totalRet)}</div><div class="cvis-bar"><div class="cvis-fill" style="width:${((t.net / mn) * 100).toFixed(1)}%;background:var(--accent)"></div></div></div>
        <div class="cvis-item"><div class="cvis-month">${pl}</div><div class="cvis-val">${R(pt.net)}</div><div style="font-size:11px;color:var(--muted);margin-bottom:6px">Bruto: ${R(pt.gross)} · Dev: ${R(pt.totalRet)}</div><div class="cvis-bar"><div class="cvis-fill" style="width:${((pt.net / mn) * 100).toFixed(1)}%;background:var(--accent2)"></div></div></div>
      </div>
      <div class="msec-title">Por Plataforma - barra sólida = atual · transparente = anterior</div>
      ${compareRows}
    </div>` : ""}`;

  openModal("reportModal");
}

export async function exportReportPNG() {
  const b = document.getElementById("exportReportButton");
  const t = document.getElementById("reportTitle")?.textContent || "Relatório";
  const s = document.querySelector("#reportModal .modal-subtitle")?.textContent || "";
  const cc = document.getElementById("reportContent");
  if (!cc || !window.html2canvas) {
    return window.dashboard?.toastError("Não foi possível exportar");
  }

  const oldLabel = b?.textContent || "";
  if (b) { b.disabled = true; b.textContent = "Exportando..."; }

  const er = document.createElement("div");
  er.className = "pdf-export-root";
  er.innerHTML = `<div class="modal rmodal pdf-export-modal"><div class="mheader"><div><div class="mtitle">${t}</div><div class="card-sub modal-subtitle">${s}</div></div></div><div>${cc.innerHTML}</div></div>`;
  document.body.appendChild(er);

  try {
    const canvas = await window.html2canvas(er.querySelector(".pdf-export-modal"), {
      backgroundColor: "#ffffff", scale: 2, useCORS: true
    });
    const u = canvas.toDataURL("image/png");
    const l = document.createElement("a");
    l.href = u;
    l.download = `${slugify(t)}.png`;
    l.click();
    window.dashboard?.toastSuccess("PNG exportado");
  } catch (e) {
    console.error(e);
    window.dashboard?.toastError("Erro ao exportar PNG");
  } finally {
    er.remove();
    if (b) { b.disabled = false; b.textContent = oldLabel; }
  }
}

function bindEvents() {
  document.getElementById("reportButton")?.addEventListener("click", openReport);
  document.getElementById("exportReportButton")?.addEventListener("click", exportReportPNG);
}

function varH(current, previous) {
  if (!previous || previous === 0) return dash;
  const diff = ((current - previous) / previous) * 100;
  const cls = diff >= 0 ? "up" : "down";
  const arrow = diff >= 0 ? "↑" : "↓";
  return `<span class="${cls}">${arrow} ${Math.abs(diff).toFixed(1)}%</span>`;
}