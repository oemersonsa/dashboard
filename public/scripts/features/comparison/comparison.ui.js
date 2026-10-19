import { state, getAvailablePeriods, getPeriodLabel } from "../../core/state.js";
import { R, RS, escapeHtml as esc, escapeAttribute as attr } from "../../core/format.js";
import { platformBadge } from "../../ui/icons.js";
import { appIcon } from "../../ui/app-icons.js";
import { previousCalendarMonth, comparisonValues, comparisonWindow, variation } from "./comparison.calc.js";

let mode = "previous";
let customMonth = "";
let platform = "";
const metrics = [
  { key: "sales", label: "Vendas", icon: "bars" },
  { key: "returns", label: "Devoluções", icon: "returns" },
  { key: "orders", label: "Pedidos", icon: "orders" }
];
const format = (value, key, compact = false) => value == null ? "—" : key === "orders" ? value.toLocaleString("pt-BR") : (compact ? RS(value) : R(value));

function badge(current, previous, key) {
  const value = variation(current, previous);
  if (value == null) return '<span class="comparison-change neutral" title="Não há base para calcular a variação percentual">Sem base</span>';
  const improved = key === "returns" ? value < 0 : value > 0;
  const tone = value === 0 ? "neutral" : improved ? "improved" : "worsened";
  return `<span class="comparison-change ${tone}">${value > 0 ? "↑ +" : value < 0 ? "↓ −" : ""}${Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</span>`;
}

export function renderComparison() {
  const root = document.getElementById("dashboard-panel-comparison");
  if (!root || state.activeTab !== "comparison") return;
  const reference = state.currentMonth;
  const periods = getAvailablePeriods();
  const alternatives = periods.filter(key => key !== reference);
  if (!alternatives.includes(customMonth)) customMonth = alternatives.at(-1) || "";
  const baseline = mode === "previous" ? previousCalendarMonth(reference) : customMonth;
  const window = comparisonWindow(reference, baseline);
  const values = (month, key = "") => comparisonValues(month, key, month === reference ? window.currentCutoff : window.previousCutoff);
  if (!state.platforms.some(p => p.key === platform)) platform = "";
  const current = values(reference);
  const previous = baseline ? values(baseline) : null;
  const currentLabel = getPeriodLabel(reference) + (window.partial && window.currentCutoff ? ` · dias 1–${window.currentCutoff}` : "");
  const previousLabel = baseline ? getPeriodLabel(baseline) + (window.partial && window.previousCutoff ? ` · dias 1–${window.previousCutoff}` : "") : "Nenhum outro mês disponível";
  const option = key => `<option value="${attr(key)}">${esc(getPeriodLabel(key))}</option>`;
  const cards = metrics.map(({ key, label, icon }) => {
    const difference = current && previous ? current[key] - previous[key] : null;
    return `<section class="card comparison-kpi"><h2>${appIcon(icon)}${label}</h2><div class="comparison-kpi-value"><strong>${format(current?.[key], key)}</strong>${badge(current?.[key], previous?.[key], key)}</div><p>${esc(previousLabel)}: ${format(previous?.[key], key)}</p><div class="comparison-difference">${difference == null ? "Sem dados para comparar" : `Diferença: ${difference > 0 ? "+ " : difference < 0 ? "− " : ""}${format(Math.abs(difference), key)}`}</div></section>`;
  }).join("");
  const header = metrics.map(({ label }) => `<th scope="colgroup" colspan="3">${label}</th>`).join("");
  const subheader = metrics.map(() => `<th scope="col">${esc(currentLabel)}</th><th scope="col">${esc(previousLabel)}</th><th scope="col">Variação</th>`).join("");
  const cells = (a, b) => metrics.map(({ key }) => `<td class="comparison-current">${format(a?.[key], key, true)}</td><td>${format(b?.[key], key, true)}</td><td>${badge(a?.[key], b?.[key], key)}</td>`).join("");
  const platforms = state.platforms.filter(p => (!platform || p.key === platform) && (!p.archived || [reference, baseline].some(month => {
    const totals = month && values(month, p.key);
    return totals && Object.values(totals).some(value => value !== 0);
  })));
  const rows = platforms.map(p => `<tr><th scope="row">${platformBadge(p)}${p.archived ? '<small class="comparison-archived">Arquivada</small>' : ""}</th>${cells(values(reference, p.key), baseline ? values(baseline, p.key) : null)}</tr>`).join("");
  const status = window.partial
    ? window.currentCutoff ? `Mês em andamento: dias 1–${window.currentCutoff} do mês selecionado contra dias 1–${window.previousCutoff} do mês de comparação.` : "Mês em andamento sem dias lançados. Registre um dia para comparar."
    : "Mês selecionado encerrado: comparação dos totais completos de cada mês.";
  const missing = !current || !previous ? ` Sem dados para ${esc(!current ? currentLabel : previousLabel)}. Valores indisponíveis aparecem como “—”.` : "";
  const returnsNote = window.partial ? " Devoluções registradas por dia respeitam o corte; devoluções mensais sem data são estimadas proporcionalmente às vendas do intervalo." : "";
  root.innerHTML = `
    <section class="card comparison-controls" aria-label="Períodos de comparação">
      <div class="fg"><label class="flabel" for="comparisonReference">Mês de referência</label><select class="finput" id="comparisonReference">${periods.map(option).join("")}</select></div>
      <div class="fg"><label class="flabel" for="comparisonBaseline">Comparar com</label><select class="finput" id="comparisonBaseline" ${mode === "previous" || !alternatives.length ? "disabled" : ""}>${mode === "previous" ? option(baseline) : alternatives.length ? alternatives.map(option).join("") : '<option value="">Nenhum outro mês disponível</option>'}</select></div>
      <div class="comparison-mode" role="group" aria-label="Modo de comparação"><button class="btn ${mode === "previous" ? "btn-primary" : "btn-secondary"}" type="button" data-comparison-mode="previous" aria-pressed="${mode === "previous"}">Mês anterior</button><button class="btn ${mode === "custom" ? "btn-primary" : "btn-secondary"}" type="button" data-comparison-mode="custom" aria-pressed="${mode === "custom"}">Escolher outro mês</button></div>
    </section>
    <p class="comparison-status" role="status">${status}${missing}</p>
    <div class="comparison-kpis">${cards}</div>
    <section class="card comparison-platforms"><div class="card-header"><div><h2 class="card-title">Comparativo por plataforma</h2><p class="card-sub">${esc(currentLabel)} em relação a ${esc(previousLabel)}.</p></div><select class="finput" id="comparisonPlatform" aria-label="Filtrar plataforma"><option value="">Todas as plataformas</option>${state.platforms.map(p => `<option value="${attr(p.key)}">${esc(p.name)}</option>`).join("")}</select></div>
    <div class="comparison-table-wrap" role="region" aria-label="Comparativo por plataforma, role para ver todas as métricas" tabindex="0"><table class="comparison-table"><caption class="sr-only">Vendas, devoluções e pedidos por plataforma, entre ${esc(currentLabel)} e ${esc(previousLabel)}</caption><thead><tr><th scope="col" rowspan="2">Plataforma</th>${header}</tr><tr>${subheader}</tr></thead><tbody>${rows || '<tr><td colspan="10">Nenhuma plataforma com dados para exibir.</td></tr>'}</tbody><tfoot><tr><th scope="row">${platform ? "Total da plataforma" : "Total"}</th>${cells(values(reference, platform), baseline ? values(baseline, platform) : null)}</tr></tfoot></table></div>
    <div class="comparison-footer"><span>Variação em relação ao mês de comparação. “Sem base” indica ausência de dados ou base zero com valor atual diferente de zero. Em devoluções, redução indica melhora.${returnsNote}</span><span class="comparison-legend"><span class="improved">● Melhora</span><span class="worsened">● Piora</span></span></div></section>`;
  root.querySelector("#comparisonReference").value = reference;
  root.querySelector("#comparisonBaseline").value = baseline;
  root.querySelector("#comparisonPlatform").value = platform;
}

export function init() {
  const root = document.getElementById("dashboard-panel-comparison");
  if (!root.dataset.bound) {
    root.addEventListener("click", event => {
      const button = event.target.closest("[data-comparison-mode]");
      if (!button) return;
      mode = button.dataset.comparisonMode;
      renderComparison();
      root.querySelector(`[data-comparison-mode="${mode}"]`).focus();
    });
    root.addEventListener("change", event => {
      const id = event.target.id;
      if (id === "comparisonReference") {
        // Use the existing period handler to keep navigation and the workspace in sync.
        const picker = document.getElementById("dashboardPeriodSelect");
        picker.value = event.target.value;
        picker.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (id === "comparisonBaseline") customMonth = event.target.value;
      else if (id === "comparisonPlatform") platform = event.target.value;
      else return;
      renderComparison();
      root.querySelector(`#${id}`)?.focus();
    });
    root.dataset.bound = "true";
  }
  renderComparison();
}
