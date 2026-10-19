import { apiRequest } from "../../core/api.js";
import { state } from "../../core/state.js";
import { parseMoney } from "../../core/format.js";
import { toastSuccess, toastError } from "../../ui/toast.js";

const BASE = "/api/integrations/mercado-livre";
const fields = {
  productCostCents: "Custo total dos produtos", packagingCents: "Embalagem", taxCents: "Impostos",
  otherCents: "Outros custos", feeOverrideCents: "Taxa do ML — ajuste opcional",
  shippingOverrideCents: "Frete — ajuste opcional", productRefundCents: "Reembolso dos produtos"
};
const missingLabels = { productCostCents: "produto", packagingCents: "embalagem", taxCents: "impostos", otherCents: "outros custos",
  feeCents: "taxa do ML", shippingCents: "frete", productRefundCents: "reembolso dos produtos", review: "conferência dos custos", charges: "revisão das cobranças selecionadas" };
const sourceLabels = { manual: "Informado por você", billing: "Faturamento da API", order: "API de pedidos", shipment: "API de envios", allocated: "Rateio do envio", sku: "Cadastro por SKU" };
const statusLabels = { paid: "Pago", cancelled: "Cancelado", confirmed: "Confirmado", payment_required: "Aguardando pagamento", partially_paid: "Pago parcialmente" };
const errors = { ml_not_connected: "Conecte sua conta em Minha conta → Mercado Livre para começar.", ml_resource_not_found: "Pedido não encontrado nesta conta. Sincronize o intervalo novamente.",
  ml_invalid_date_range: "Escolha um intervalo válido de até 31 dias.", ml_invalid_costs: "Confira os custos: use valores positivos ou zero. Campos vazios ficam pendentes ou usam o valor indicado da API/SKU.",
  ml_cost_conflict: "Os custos deste pedido mudaram em outra sessão. Descarte o rascunho e abra o pedido novamente antes de salvar.",
  ml_invalid_charges: "As cobranças selecionadas mudaram. Recarregue o pedido e confira a seleção.", ml_rate_limited: "Limite de consultas do Mercado Livre atingido. Aguarde um minuto antes de continuar.",
  too_many_requests: "Limite de consultas atingido. Aguarde um minuto e tente novamente.", ml_reconnect_required: "Reconecte sua conta em Minha conta → Mercado Livre.",
  ml_permission_denied: "A API recusou o acesso. Confira as permissões de pedidos, envios e faturamento da aplicação.",
  ml_not_configured: "Configure a integração em Minha conta → Mercado Livre.", ml_connection_busy: "A conexão está sendo renovada. Tente novamente em instantes.",
  ml_connection_changed: "A conexão mudou. Abra esta página novamente.", ml_sync_restart_required: "A sincronização mudou. Inicie o intervalo novamente.",
  ml_range_too_large: "Escolha um intervalo menor para sincronizar este volume de pedidos." };
let owner = "", busy = false, bound = false, offset = 0, next = null, selected = null, dirty = false, syncResume = null;
const el = id => document.getElementById(id);
const money = value => value === null || value === undefined ? "Pendente" : (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const percent = value => value === null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const dateText = value => new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
function status(text) { el("orderMarginNotice").textContent = text; }
function controls() {
  el("dashboard-panel-orders").setAttribute("aria-busy", String(busy));
  el("dashboard-panel-orders").querySelectorAll("button, input, select, textarea").forEach(input => { input.disabled = busy || input.dataset.unavailable === "true"; });
  el("orderMarginPrevious").disabled = busy || offset === 0;
  el("orderMarginNext").disabled = busy || next === null;
  el("orderMarginRefreshFinancials").disabled = busy || dirty;
}
async function run(action) {
  if (busy) return;
  const requestedOwner = owner;
  busy = true; controls();
  try { await action(requestedOwner); }
  catch (error) { if (state.auth?.username === requestedOwner) { const text = errors[error.message] || "Não foi possível concluir a consulta. Tente novamente."; status(text); toastError(text); } }
  finally { busy = false; controls(); if (requestedOwner !== owner) void run(load); }
}
function active(user) { return user === owner && user === state.auth?.username; }
function input() { return { from: el("orderMarginFrom").value, to: el("orderMarginTo").value,
  q: el("orderMarginQuery").value.trim(), status: el("orderMarginStatus").value, margin: el("orderMarginFilter").value }; }
function cell(row, text, className = "") { const td = document.createElement("td"); td.textContent = text; td.className = className; row.append(td); return td; }
function summaryCard(label, value, sub) {
  const card = document.createElement("div"); card.className = "card order-margin-kpi";
  const title = document.createElement("span"); title.textContent = label;
  const number = document.createElement("strong"); number.textContent = value;
  const help = document.createElement("small"); help.textContent = sub;
  card.append(title, number, help); return card;
}
async function load(user) {
  status("Consultando pedidos salvos…");
  const data = await apiRequest(`${BASE}/margins?${new URLSearchParams({ ...input(), offset })}`);
  if (!active(user)) return;
  next = data.nextOffset;
  const s = data.summary;
  el("orderMarginKpis").replaceChildren(
    summaryCard("Vendas com cálculo", money(s.salesCents), `${s.calculated} pedidos com custos conferidos`),
    summaryCard("Resultado dos pedidos", money(s.profitCents), "Depois dos custos e reembolsos informados"),
    summaryCard("Margem sobre vendas", percent(s.marginPercent), "Resultado ÷ vendas dos pedidos com cálculo"),
    summaryCard("Precisam de atenção", String(s.pending), `${s.estimated} cálculos usam estimativas`)
  );
  const body = el("orderMarginRows"); body.replaceChildren();
  for (const item of data.records) {
    const { order: o, calculation: c } = item;
    const row = document.createElement("tr");
    const first = cell(row, `${o.id}\n${dateText(o.dateCreated)} · ${statusLabels[o.status] || o.status}`);
    first.className = "order-reference";
    cell(row, o.items.map(p => `${p.quantity} × ${p.title}${p.sku ? ` · ${p.sku}` : ""}`).join("\n"), "order-products");
    cell(row, o.currency === "BRL" ? money(o.grossCents) : `${o.currency} ${(o.grossCents / 100).toFixed(2)}`, "order-number");
    cell(row, money(c.costs.feeCents), "order-number"); cell(row, money(c.costs.shippingCents), "order-number"); cell(row, money(c.costs.productCostCents), "order-number");
    cell(row, money(c.profitCents), `order-number${c.profitCents < 0 ? " margin-negative" : ""}`); cell(row, percent(c.marginPercent), "order-number");
    const stateCell = cell(row, !c.eligible ? "Fora do cálculo" : !c.ready ? "Custos pendentes" : c.estimated ? "Estimada" : "Custos conferidos");
    stateCell.className = !c.ready ? "margin-pending" : "";
    const action = document.createElement("button"); action.className = "btn btn-secondary"; action.type = "button"; action.textContent = "Analisar";
    action.setAttribute("aria-label", `Analisar pedido ${o.id}`);
    action.addEventListener("click", () => void run(async user => {
      if (dirty) { status("Salve ou descarte as alterações do pedido aberto antes de analisar outro."); return; }
      const details = await apiRequest(`${BASE}/margins/${o.id}`);
      if (!active(user)) return;
      renderDetail(details);
      el("orderMarginDetail").scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    const td = document.createElement("td"); td.append(action); row.append(td); body.append(row);
  }
  if (!data.records.length) { const row = document.createElement("tr"); cell(row, "Nenhum pedido encontrado. Sincronize o intervalo ou ajuste os filtros.").colSpan = 10; body.append(row); }
  el("orderMarginPage").textContent = `${data.total} pedidos · página ${offset / 50 + 1}`;
  status("Os indicadores consideram todos os pedidos do filtro com custos preenchidos e conferidos. Pedidos pendentes, cancelados e em outras moedas não entram no resultado.");
}
function fieldHelp(field, data) {
  const c = data.calculation;
  const fallbacks = { productCostCents: [c.catalog.productCostCents, "Custo atual do cadastro por SKU"], packagingCents: [c.catalog.packagingCents, "Embalagem atual do cadastro por SKU"],
    feeOverrideCents: [data.financial.billing?.saleFeeCents ?? data.order.saleFeeCents, "Taxa da API"], shippingOverrideCents: [data.financial.shipping?.costCents, "Frete do vendedor informado pela API"],
    productRefundCents: [data.order.refundsKnown && data.order.refundedCents === 0 ? 0 : null, "Reembolso dos produtos"] };
  const fallback = fallbacks[field];
  if (!fallback) return "Informe o valor total deste pedido; use 0 se não houver custo.";
  return fallback[0] !== null && fallback[0] !== undefined ? `${fallback[1]}: ${money(fallback[0])}. Vazio usa esse valor.`
    : "Sem valor confirmado. Informe o total deste pedido; use 0 se não houver custo.";
}
function renderDetail(data) {
  selected = data; dirty = false;
  const { order: o, calculation: c, financial: f, settings: s } = data;
  el("orderMarginDetail").hidden = false;
  el("orderMarginDetailTitle").textContent = `Pedido ${o.id}`;
  el("orderMarginDetailSub").textContent = `${dateText(o.dateCreated)} · ${statusLabels[o.status] || o.status} · ${o.items.map(item => `${item.quantity} × ${item.title}`).join("; ")}`;
  el("orderMarginResult").textContent = c.ready ? `${money(c.profitCents)} · margem ${percent(c.marginPercent)}${c.estimated ? " (estimada)" : ""}` : "Margem pendente";
  el("orderMarginMissing").textContent = !c.eligible ? "O cálculo considera somente pedidos pagos em BRL." : c.missing.length
    ? `Falta conferir: ${c.missing.map(field => missingLabels[field] || field).join(", ")}.` : "Cálculo baseado nos custos conferidos. Despesas fixas só entram se você as incluir em outros custos.";
  const breakdown = [
    ["Venda de produtos", o.currency === "BRL" ? money(o.grossCents) : `${o.currency} ${(o.grossCents / 100).toFixed(2)}`], ["Taxa do Mercado Livre", `${money(c.costs.feeCents)} · ${sourceLabels[c.sources.fee]}`],
    ["Frete do vendedor", `${money(c.costs.shippingCents)} · ${sourceLabels[c.sources.shipping]}`],
    ["Produtos", `${money(c.costs.productCostCents)} · ${sourceLabels[c.sources.product]}`], ["Embalagem", money(c.costs.packagingCents)],
    ["Impostos", money(c.costs.taxCents)], ["Outros custos", money(c.costs.otherCents)], ["Reembolso dos produtos", money(c.costs.productRefundCents)],
    ["Cobranças adicionais selecionadas", money(c.extraCents)]
  ];
  const dl = el("orderMarginBreakdown"); dl.replaceChildren();
  for (const [label, value] of breakdown) { const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = label; dd.textContent = value; dl.append(dt, dd); }
  el("orderMarginSourceNote").textContent = [data.financialUpdatedAt ? `Consulta financeira: ${new Date(data.financialUpdatedAt).toLocaleString("pt-BR")}.` : "Clique em Consultar taxas e frete para buscar os valores da API.",
    f.shipping?.reason ? (errors[f.shipping.reason] || f.shipping.reason) : "", ...(f.warnings || []),
    o.refundedCents > 0 ? `A API informa ${money(o.refundedCents)} em reembolsos, que podem incluir frete. Confirme no campo abaixo apenas a parcela referente aos produtos.` : ""].filter(Boolean).join(" ");
  const container = el("orderMarginCostFields"); container.replaceChildren();
  for (const [field, label] of Object.entries(fields)) {
    const wrapper = document.createElement("label"); wrapper.className = "fg";
    const caption = document.createElement("span"); caption.className = "flabel"; caption.textContent = `${label} (R$)`;
    const input = document.createElement("input"); input.className = "finput"; input.type = "text"; input.inputMode = "decimal";
    input.id = `orderCost-${field}`; input.value = s[field] === null || s[field] === undefined ? "" : (s[field] / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const help = document.createElement("small"); help.className = "card-sub"; help.id = `${input.id}-help`; help.textContent = fieldHelp(field, data); input.setAttribute("aria-describedby", help.id);
    wrapper.append(caption, input, help); container.append(wrapper);
  }
  el("orderMarginReviewed").checked = Boolean(s.reviewed); el("orderMarginNote").value = s.note || "";
  el("orderMarginDirty").hidden = true;
  const body = el("orderMarginCharges"); body.replaceChildren();
  for (const charge of f.billing?.charges || []) {
    const row = document.createElement("tr");
    const td = document.createElement("td");
    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.dataset.chargeId = charge.id;
    checkbox.dataset.unavailable = String(!charge.selectable); checkbox.disabled = !charge.selectable;
    checkbox.checked = Boolean(s.includedChargeIds?.includes(charge.id)); checkbox.setAttribute("aria-label", `Incluir ${charge.label} como cobrança adicional`);
    td.append(checkbox); row.append(td); cell(row, `${charge.label} (${charge.subtype})`);
    cell(row, charge.amountCents === null ? "Não informado" : `${charge.type === "BONUS" ? "Crédito " : ""}${charge.currency || "?"} ${(charge.amountCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
    cell(row, [charge.covered ? "Já contemplada na taxa/frete" : charge.shared ? "Compartilhada: requer rateio manual" : !charge.selectable ? "Indisponível para inclusão" : "Inclusão opcional", charge.status].filter(Boolean).join(" · "));
    body.append(row);
  }
  if (!body.children.length) { const row = document.createElement("tr"); cell(row, "Nenhuma cobrança detalhada disponível. O faturamento pode levar tempo para ser disponibilizado.").colSpan = 4; body.append(row); }
  el("orderMarginBillingStatus").textContent = f.billing?.checkedAt ? `Faturamento consultado em ${new Date(f.billing.checkedAt).toLocaleString("pt-BR")}. Atualização desse relatório no máximo uma vez a cada 24 horas por pedido.` : "O faturamento será consultado junto com taxas e frete.";
  controls();
}
function readCosts() {
  const costs = {};
  for (const field of Object.keys(fields)) {
    const value = el(`orderCost-${field}`).value.trim();
    const parsed = value ? parseMoney(value) : null;
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) throw new Error("ml_invalid_costs");
    costs[field] = parsed === null ? null : Math.round(parsed * 100);
  }
  costs.note = el("orderMarginNote").value.trim(); costs.reviewed = el("orderMarginReviewed").checked;
  costs.includedChargeIds = [...el("orderMarginCharges").querySelectorAll('input:checked[data-unavailable="false"]')].map(input => input.dataset.chargeId);
  return costs;
}
function mount() {
  el("dashboard-panel-orders").innerHTML = `
    <section class="card order-margin-intro"><div><span class="order-margin-eyebrow">MERCADO LIVRE · RESULTADO POR PEDIDO</span><h2>Saiba quanto sobra de cada venda</h2><p class="card-sub">Venda menos taxa, frete, produto, embalagem, impostos e demais custos. Margem = resultado ÷ valor da venda.</p></div><button class="btn btn-secondary" id="orderMarginConnection" type="button">Minha conexão</button></section>
    <section class="card"><form id="orderMarginFilters" class="order-margin-filters">
      <label class="fg"><span class="flabel">De</span><input class="finput" id="orderMarginFrom" type="date" required></label>
      <label class="fg"><span class="flabel">Até</span><input class="finput" id="orderMarginTo" type="date" required></label>
      <label class="fg order-margin-search"><span class="flabel">Pedido, produto ou SKU</span><input class="finput" id="orderMarginQuery" maxlength="100" placeholder="Buscar pedidos"></label>
      <label class="fg"><span class="flabel">Status</span><select class="finput" id="orderMarginStatus"><option value="all">Todos</option><option value="paid">Pagos</option><option value="cancelled">Cancelados</option></select></label>
      <label class="fg"><span class="flabel">Resultado</span><select class="finput" id="orderMarginFilter"><option value="all">Todos</option><option value="pending">Custos pendentes</option><option value="profit">Resultado ≥ 0</option><option value="loss">Prejuízo</option></select></label>
      <button class="btn btn-primary" type="submit">Consultar</button><button class="btn btn-secondary" id="orderMarginSync" type="button">Sincronizar pedidos</button>
    </form><p class="card-sub">Até 31 dias por consulta, pela data de criação no horário de Brasília. Os custos de produto e embalagem podem vir do cadastro da calculadora quando o SKU corresponde a um único produto.</p><p id="orderMarginNotice" role="status" aria-live="polite">Carregando pedidos…</p></section>
    <div class="order-margin-kpis" id="orderMarginKpis"></div>
    <section class="card"><div class="order-margin-table"><table aria-label="Resultado por pedido"><thead><tr><th>Pedido</th><th>Produtos</th><th>Venda</th><th>Taxa ML</th><th>Frete</th><th>Custo produto</th><th>Resultado</th><th>Margem</th><th>Situação</th><th>Ações</th></tr></thead><tbody id="orderMarginRows"></tbody></table></div><div class="order-margin-actions"><button class="btn btn-secondary" id="orderMarginPrevious" type="button">Anterior</button><span id="orderMarginPage"></span><button class="btn btn-secondary" id="orderMarginNext" type="button">Próxima</button></div></section>
    <section class="card order-margin-detail" id="orderMarginDetail" aria-labelledby="orderMarginDetailTitle" hidden>
      <header class="order-margin-detail-header"><div><h2 id="orderMarginDetailTitle"></h2><p class="card-sub" id="orderMarginDetailSub"></p></div><button class="btn btn-secondary" id="orderMarginRefreshFinancials" type="button">Consultar taxas e frete</button></header>
      <p id="orderMarginSourceNote" class="card-sub"></p>
      <div class="order-margin-detail-grid"><div class="order-margin-calculation"><span class="flabel">RESULTADO DO PEDIDO</span><strong id="orderMarginResult"></strong><p id="orderMarginMissing" class="card-sub"></p><dl id="orderMarginBreakdown"></dl></div>
      <form id="orderMarginCostForm"><h3>Custos deste pedido</h3><p class="card-sub">Os campos são totais do pedido, não valores por unidade. Valores digitados substituem a origem indicada abaixo do campo. Deixar vazio volta a usar a API ou o cadastro por SKU, quando disponível.</p><div class="order-margin-cost-fields" id="orderMarginCostFields"></div>
      <label class="fg"><span class="flabel">Observações</span><textarea class="finput" id="orderMarginNote" maxlength="1000" rows="2"></textarea></label>
      <label class="order-margin-review"><input id="orderMarginReviewed" type="checkbox">Conferi os custos e as cobranças selecionadas, sem repetir valores já incluídos.</label><p class="card-sub" id="orderMarginDirty" hidden>Há alterações não salvas. Salve para recalcular a margem.</p>
      <div class="order-margin-actions"><button class="btn btn-primary" type="submit">Salvar e calcular margem</button><button class="btn btn-secondary" id="orderMarginDiscard" type="button">Descartar alterações</button></div></form></div>
      <section class="order-margin-billing"><h3>Cobranças de faturamento</h3><p class="card-sub">As cobranças abaixo são para conferência. Marque somente cobranças adicionais ainda não descontadas nos campos acima. Créditos selecionados aumentam o resultado. Tarifa de venda e frete já contemplados não são somados novamente.</p><p class="card-sub" id="orderMarginBillingStatus"></p><div class="order-margin-table"><table aria-label="Cobranças do pedido"><thead><tr><th>Incluir</th><th>Descrição</th><th>Valor</th><th>Observação</th></tr></thead><tbody id="orderMarginCharges"></tbody></table></div></section>
    </section>`;
}
export function init() {
  if (!bound) {
    mount(); bound = true;
    el("orderMarginFilters").addEventListener("submit", event => { event.preventDefault(); offset = 0; void run(load); });
    el("orderMarginConnection").addEventListener("click", () => { window.dashboard.setActiveScreen("account"); window.dashboard.renderScreen(); });
    el("orderMarginPrevious").addEventListener("click", () => { offset = Math.max(0, offset - 50); void run(load); });
    el("orderMarginNext").addEventListener("click", () => { offset = next ?? 0; void run(load); });
    el("orderMarginSync").addEventListener("click", () => void run(async user => {
      if (dirty) { status("Salve ou descarte as alterações do pedido antes de sincronizar."); return; }
      const filters = input();
      const key = `${filters.from}:${filters.to}`;
      let page = syncResume?.key === key ? syncResume.offset : 0;
      try {
        do {
          const result = await apiRequest(`${BASE}/sync`, { method: "POST", body: JSON.stringify({ ...filters, kind: "orders", offset: page }) });
          if (!active(user)) return;
          page = result.nextOffset;
          syncResume = page === null ? null : { key, offset: page };
          el("orderMarginSync").textContent = page === null ? "Sincronizar pedidos" : "Continuar sincronização";
          status(`Sincronizando pedidos: ${Math.min(result.total, (page ?? result.total))} de ${result.total}.`);
        } while (page !== null);
      } catch (error) {
        if (error.message === "ml_sync_restart_required") { syncResume = null; el("orderMarginSync").textContent = "Sincronizar pedidos"; }
        throw error;
      }
      offset = 0; el("orderMarginDetail").hidden = true; selected = null; await load(user); toastSuccess("Pedidos sincronizados. Abra um pedido para consultar as cobranças.");
    }));
    el("orderMarginRefreshFinancials").addEventListener("click", () => void run(async user => {
      if (!selected || dirty) return;
      status("Consultando pedido, taxas, frete e faturamento no Mercado Livre…");
      const details = await apiRequest(`${BASE}/margins/${selected.order.id}/refresh`, { method: "POST" });
      if (!active(user)) return;
      renderDetail(details); await load(user); toastSuccess("Dados financeiros consultados. Confira os campos pendentes.");
    }));
    el("orderMarginDetail").addEventListener("input", event => {
      if (!event.target.matches("input, textarea")) return;
      dirty = true; el("orderMarginDirty").hidden = false;
      el("orderMarginResult").textContent = "Alterações não salvas";
      el("orderMarginMissing").textContent = "Salve os custos para atualizar o resultado deste pedido.";
      if (event.target.id !== "orderMarginReviewed") el("orderMarginReviewed").checked = false;
      controls();
    });
    el("orderMarginDiscard").addEventListener("click", () => void run(async user => {
      if (!selected) return;
      const details = await apiRequest(`${BASE}/margins/${selected.order.id}`);
      if (active(user)) renderDetail(details);
    }));
    el("orderMarginCostForm").addEventListener("submit", event => {
      event.preventDefault(); void run(async user => {
        const costs = readCosts();
        status("Salvando os custos e recalculando a margem…");
        const details = await apiRequest(`${BASE}/margins/${selected.order.id}/costs`, { method: "POST", body: JSON.stringify({ costs, expectedUpdatedAt: selected.updatedAt }) });
        if (!active(user)) return;
        renderDetail(details); await load(user); toastSuccess("Custos salvos e margem recalculada.");
      });
    });
    window.addEventListener("beforeunload", event => {
      if (dirty && owner === state.auth?.username) { event.preventDefault(); event.returnValue = ""; }
    });
  }
  if (owner !== state.auth?.username) {
    owner = state.auth?.username || ""; selected = null; dirty = false; offset = 0; next = null;
    syncResume = null; el("orderMarginSync").textContent = "Sincronizar pedidos";
    el("orderMarginDetail").hidden = true; el("orderMarginRows").replaceChildren(); el("orderMarginKpis").replaceChildren();
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    el("orderMarginFrom").value = `${parts.slice(0, 7)}-01`; el("orderMarginTo").value = parts;
    el("orderMarginQuery").value = ""; el("orderMarginStatus").value = "all"; el("orderMarginFilter").value = "all";
  }
  if (!dirty) void run(load);
}
