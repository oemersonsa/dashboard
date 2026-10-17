import { apiRequest } from "../../core/api.js";
import { state } from "../../core/state.js";
import { toastSuccess, toastError } from "../../ui/toast.js";

const BASE = "/api/integrations/mercado-livre";
const messages = {
  ml_not_configured: "Configure as credenciais do Mercado Livre no servidor para conectar.",
  ml_not_connected: "Conecte sua conta do Mercado Livre.",
  ml_reconnect_required: "Sua autorização expirou. Reconecte a conta.",
  ml_permission_denied: "O Mercado Livre negou o acesso. Confira as permissões da aplicação.",
  ml_rate_limited: "Limite de consultas atingido. Aguarde um minuto e tente novamente.",
  too_many_requests: "Limite de consultas atingido. Aguarde um minuto e tente novamente.",
  ml_invalid_date_range: "Selecione um intervalo de até 31 dias, com início anterior ao fim.",
  ml_range_too_large: "Há muitos registros. Sincronize um intervalo menor.",
  ml_connection_busy: "A conexão está sendo renovada. Tente novamente em instantes.",
  ml_connection_changed: "A conexão mudou durante a consulta. Atualize a página.",
  ml_resource_not_found: "Os detalhes desta devolução ainda não estão disponíveis.",
  ml_credentials_unavailable: "Não foi possível ler as credenciais. Verifique a chave no servidor e reconecte.",
  ml_unavailable: "O Mercado Livre não respondeu. Tente novamente em instantes."
};
const labels = { paid: "Pago", cancelled: "Cancelado", confirmed: "Confirmado", payment_required: "Aguardando pagamento",
  payment_in_process: "Pagamento em processamento", partially_paid: "Pago parcialmente", invalid: "Inválido",
  opened: "Aberta", closed: "Encerrada", dispute: "Mediação", claim: "Reclamação", return: "Devolução",
  mediations: "Reclamação", cancel_purchase: "Cancelamento pelo comprador", cancel_sale: "Cancelamento pelo vendedor",
  pending: "Pendente", ready_to_ship: "Pronto para envio", shipped: "Enviado", delivered: "Entregue", not_delivered: "Não entregue" };
let bound = false;
let busy = false;
let connected = false;
let offset = 0;
let nextOffset = null;
let owner = "";
let revision = 0;
let resume = null;
const el = id => document.getElementById(id);
const translate = value => labels[value] || value || "—";
const money = cents => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function errorMessage(error) { return messages[error.message] || "Não foi possível consultar o Mercado Livre. Tente novamente."; }
function params() { return { from: el("mlFrom").value, to: el("mlTo").value, kind: el("mlKind").value }; }
function notice(text) { el("mlNotice").textContent = text; }
function controls() {
  el("mlConnect").disabled = busy;
  el("mlDisconnect").disabled = busy;
  el("mlSync").disabled = busy || !connected;
  el("mlRefresh").disabled = busy || !connected;
  el("mlPrevious").disabled = busy || offset === 0;
  el("mlNext").disabled = busy || nextOffset === null;
  for (const id of ["mlFrom", "mlTo", "mlKind"]) el(id).disabled = busy;
}
function cell(row, value) { const td = document.createElement("td"); td.textContent = value; row.append(td); return td; }
function renderRows(data, kind) {
  const body = el("mlRows");
  body.replaceChildren();
  el("mlValueHeading").textContent = kind === "orders" ? "Produtos / reembolsos" : "Motivo / devolução";
  for (const record of data.records) {
    const row = document.createElement("tr");
    cell(row, record.id);
    cell(row, new Date(record.dateCreated).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }));
    cell(row, translate(record.status));
    if (kind === "orders") {
      cell(row, record.items.map(item => `${item.quantity} × ${item.title}${item.sku ? ` (${item.sku})` : ""}`).join("; "));
      const format = amount => (amount / 100).toLocaleString("pt-BR", { style: "currency", currency: record.currency || "BRL" });
      cell(row, `${format(record.grossCents)} / ${format(record.refundedCents)}`);
    } else {
      cell(row, `${translate(record.type)} · ${record.resource || "recurso"} ${record.resourceId}`);
      const details = cell(row, record.reason || "—");
      if (record.hasReturn) {
        const button = document.createElement("button");
        button.className = "btn btn-secondary";
        button.type = "button";
        button.textContent = "Consultar devolução";
        button.addEventListener("click", async () => {
          button.disabled = true;
          const requestedOwner = owner;
          const requestedRevision = revision;
          try {
            const result = await apiRequest(`${BASE}/claims/${encodeURIComponent(record.id)}/return`);
            if (owner !== requestedOwner || revision !== requestedRevision || state.auth?.username !== requestedOwner) return;
            const info = document.createElement("p");
            info.textContent = `Devolução ${result.id}: ${translate(result.status)}. ` + result.shipments.map(item =>
              `${translate(item.status)}${item.trackingNumber ? ` · rastreio ${item.trackingNumber}` : ""}`).join("; ");
            details.append(info);
            button.remove();
          } catch (error) { if (state.auth?.username === requestedOwner) toastError(errorMessage(error)); }
          finally { button.disabled = false; }
        });
        details.append(document.createElement("br"), button);
      }
    }
    body.append(row);
  }
  if (!data.records.length) {
    const row = document.createElement("tr");
    cell(row, "Nenhum registro local neste intervalo. Use Sincronizar para consultar a API.").colSpan = 5;
    body.append(row);
  }
  el("mlPage").textContent = `${data.total} registros · página ${Math.floor(offset / 50) + 1}`;
  el("mlSummary").textContent = kind === "orders"
    ? `Produtos dos pedidos pagos (BRL): ${money(data.summary.paidCents)} · Reembolsos informados (BRL): ${money(data.summary.refundedCents)}`
    : `${data.total} reclamações e devoluções abertas no intervalo selecionado (inclui casos já encerrados).`;
  nextOffset = data.nextOffset;
}
async function loadRecords(requestedOwner, requestedRevision) {
  const input = params();
  el("mlRows").replaceChildren();
  el("mlSummary").textContent = "";
  el("mlPage").textContent = "Carregando…";
  nextOffset = null;
  const data = await apiRequest(`${BASE}/records?${new URLSearchParams({ ...input, offset })}`);
  if (owner === requestedOwner && state.auth?.username === owner && revision === requestedRevision) renderRows(data, input.kind);
}
async function run(action) {
  if (busy) return;
  busy = true;
  controls();
  const requestedOwner = owner;
  const requestedRevision = revision;
  try { await action(requestedOwner, requestedRevision); }
  catch (error) { if (state.auth?.username === requestedOwner && revision === requestedRevision) { notice(errorMessage(error)); toastError(errorMessage(error)); } }
  finally {
    busy = false;
    controls();
    if (owner !== requestedOwner) void run(refresh);
  }
}
async function refresh(requestedOwner, requestedRevision) {
  const status = await apiRequest(BASE);
  if (requestedOwner !== state.auth?.username || revision !== requestedRevision) return;
  connected = status.connected;
  el("mlConnect").textContent = connected ? "Reconectar conta" : "Conectar Mercado Livre";
  el("mlConnect").hidden = !status.configured;
  el("mlDisconnect").hidden = !connected;
  notice(!status.configured ? messages.ml_not_configured : connected
    ? `Conta conectada: ${status.nickname} (${status.sellerId}).` : "Conecte sua conta para consultar pedidos e devoluções.");
  el("mlData").hidden = !connected;
  if (connected) await loadRecords(requestedOwner, requestedRevision);
}
export function init() {
  if (!el("mlIntegration")) return;
  if (owner !== state.auth?.username) {
    owner = state.auth?.username || "";
    revision++;
    connected = false;
    offset = 0;
    nextOffset = null;
    resume = null;
    el("mlSync").textContent = "Sincronizar intervalo";
    el("mlRows").replaceChildren();
    el("mlData").hidden = true;
    el("mlDisconnect").hidden = true;
    el("mlSummary").textContent = "";
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    el("mlFrom").value = `${today.slice(0, 7)}-01`;
    el("mlTo").value = today;
  }
  if (!bound) {
    bound = true;
    el("mlConnect").addEventListener("click", () => void run(async (user, version) => {
      const result = await apiRequest(`${BASE}/authorize`, { method: "POST" });
      if (user === state.auth?.username && version === revision) window.location.assign(result.url);
    }));
    el("mlDisconnect").addEventListener("click", () => void run(async (user, version) => {
      await apiRequest(BASE, { method: "DELETE" });
      if (user !== state.auth?.username || version !== revision) return;
      el("mlRows").replaceChildren();
      await refresh(user, version);
      toastSuccess("Conexão removida deste aplicativo.");
    }));
    el("mlRefresh").addEventListener("click", () => void run(async (user, version) => { offset = 0; await loadRecords(user, version); }));
    el("mlPrevious").addEventListener("click", () => void run(async (user, version) => { offset = Math.max(0, offset - 50); await loadRecords(user, version); }));
    el("mlNext").addEventListener("click", () => void run(async (user, version) => { offset = nextOffset ?? 0; await loadRecords(user, version); }));
    el("mlSync").addEventListener("click", () => void run(async (user, version) => {
      const input = params();
      const selection = JSON.stringify(input);
      let page = resume?.selection === selection ? resume.offset : 0;
      let count = page;
      notice("Sincronizando com o Mercado Livre…");
      do {
        const result = await apiRequest(`${BASE}/sync`, { method: "POST", body: JSON.stringify({ ...input, offset: page }) });
        if (user !== state.auth?.username || version !== revision) return;
        count += result.count;
        page = result.nextOffset;
        resume = page === null ? null : { selection, offset: page };
        el("mlSync").textContent = page === null ? "Sincronizar intervalo" : "Continuar sincronização";
        notice(`Sincronizando: ${count} de ${result.total} registros. Páginas concluídas já estão salvas.`);
      } while (page !== null);
      offset = 0;
      await loadRecords(user, version);
      notice(`Sincronização concluída: ${count} registros consultados. ${new Date().toLocaleString("pt-BR")}.`);
      toastSuccess("Dados do Mercado Livre atualizados.");
    }));
    for (const id of ["mlFrom", "mlTo", "mlKind"]) el(id).addEventListener("change", () => {
      offset = 0;
      resume = null;
      el("mlSync").textContent = "Sincronizar intervalo";
      notice("Consultando o histórico local. Use Sincronizar intervalo para atualizar os dados pela API.");
      void run(loadRecords);
    });
  }
  const outcome = new URLSearchParams(location.search).get("ml");
  if (outcome) {
    if (outcome === "failed") toastError("A conexão não foi concluída. Confira a configuração e tente conectar novamente.");
    const url = new URL(location.href);
    url.searchParams.delete("ml");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  void run(refresh);
}
