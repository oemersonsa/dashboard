import { apiRequest } from "../../core/api.js";
import { state } from "../../core/state.js";
import { toastSuccess, toastError } from "../../ui/toast.js";
import { showGlobalLoader, hideGlobalLoader } from "../../ui/skeleton.js";

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
  ml_oauth_cookie_missing: "O retorno do Mercado Livre chegou sem a identificação desta tentativa. Abra o Kanri e conclua a autorização no mesmo navegador, mantendo os cookies do app habilitados.",
  ml_oauth_browser_mismatch: "O retorno pertence a outra tentativa de conexão. Feche as tentativas antigas e clique em Conectar Mercado Livre novamente no mesmo navegador.",
  ml_oauth_expired: "A tentativa expirou ou já foi utilizada. Clique em Conectar Mercado Livre e conclua a autorização em até 10 minutos.",
  ml_invalid_oauth_state: "O Mercado Livre retornou sem uma identificação válida da tentativa. Inicie a conexão novamente pelo botão do Kanri.",
  ml_authorization_denied: "A autorização foi recusada ou cancelada no Mercado Livre. Inicie uma nova tentativa e confira as permissões solicitadas.",
  ml_invalid_client: "O Mercado Livre recusou o App ID ou Client Secret. Confira se ML_CLIENT_ID e ML_CLIENT_SECRET na Vercel pertencem à mesma aplicação e faça um novo deploy.",
  ml_invalid_oauth_request: "O Mercado Livre recusou a troca da autorização. Confira a URL de retorno e a configuração PKCE da aplicação e inicie uma tentativa nova.",
  ml_invalid_authorization_code: "O Mercado Livre recusou o código de autorização. Inicie uma tentativa nova pelo Kanri; se repetir, confira a URL de retorno e se está usando a conta principal da loja.",
  ml_offline_access_required: "O Mercado Livre autorizou o acesso, mas não enviou o token de renovação. Confira o acesso offline da aplicação antes de reconectar.",
  ml_invalid_response: "O Mercado Livre não retornou todos os dados necessários para concluir a conexão. Inicie uma nova tentativa.",
  ml_callback_failed: "O servidor não conseguiu concluir o retorno da autorização. Consulte os logs da Vercel para identificar a falha.",
  ml_unavailable: "O Mercado Livre não respondeu. Tente novamente em instantes."
};
Object.assign(messages, {
  ml_sync_incomplete: "Sincronize todos os pedidos deste intervalo antes de preparar a prévia para o dashboard.",
  ml_sync_restart_required: "A sincronização mudou ou foi interrompida. Inicie o intervalo novamente.",
  ml_platform_required: "Selecione uma plataforma ativa para receber as vendas.",
  ml_orders_required: "Selecione Pedidos e vendas para atualizar o dashboard.",
  ml_preview_expired: "Os dados mudaram depois da prévia. Prepare uma nova prévia antes de confirmar.",
  ml_preview_required: "Prepare uma prévia antes de atualizar o dashboard.",
  ml_save_pending: "Há alterações pendentes no dashboard. Conclua o salvamento antes de continuar.",
  ml_dashboard_reload_failed: "As vendas foram salvas. Atualize a página para carregar os novos totais."
});
Object.assign(messages, {
  ml_scheduler_not_configured: "Para habilitar a atualização diária, configure CRON_SECRET na Vercel com pelo menos 16 caracteres e faça um novo deploy.",
  ml_invalid_auto_sync_settings: "Não foi possível salvar a atualização diária. Tente novamente.",
  ml_auto_sync_failed: "A atualização diária falhou. Tente atualizar novamente; se persistir, consulte os logs do servidor.",
  ml_auto_sync_changed: "A configuração ou a conta mudou durante a atualização. Confira o destino e tente novamente."
});
const labels = { paid: "Pago", cancelled: "Cancelado", confirmed: "Confirmado", payment_required: "Aguardando pagamento",
  payment_in_process: "Pagamento em processamento", partially_paid: "Pago parcialmente", invalid: "Inválido",
  opened: "Aberta", closed: "Encerrada", dispute: "Mediação", claim: "Reclamação", return: "Devolução",
  mediations: "Reclamação", cancel_purchase: "Cancelamento pelo comprador", cancel_sale: "Cancelamento pelo vendedor",
  pending: "Pendente", ready_to_ship: "Pronto para envio", shipped: "Enviado", delivered: "Entregue", not_delivered: "Não entregue" };
let bound = false;
let busy = false;
let connected = false;
let canConnect = false;
let offset = 0;
let nextOffset = null;
let owner = "";
let revision = 0;
let resume = null;
let dashboardPreview = null;
let authorizationProblem = "";
let automatic = null;
const el = id => document.getElementById(id);
const translate = value => labels[value] || value || "—";
const money = cents => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function errorMessage(error) { return messages[error.message] || "Não foi possível consultar o Mercado Livre. Tente novamente."; }
function params() { return { from: el("mlFrom").value, to: el("mlTo").value, kind: el("mlKind").value }; }
function notice(text) { el("mlNotice").textContent = text; }
function controls() {
  el("mlAutoEnable").disabled = busy || !connected || !automatic?.schedulerConfigured;
  el("mlAutoPause").disabled = busy;
  el("mlAutoRun").disabled = busy || !connected || !automatic?.enabled;
  el("mlConnect").disabled = busy || !canConnect;
  el("mlDisconnect").disabled = busy;
  el("mlSync").disabled = busy || !connected;
  el("mlRefresh").disabled = busy || !connected;
  el("mlPrepareDashboard").disabled = busy || !connected || el("mlKind").value !== "orders";
  el("mlApplyDashboard").disabled = busy || !dashboardPreview?.data.changedDays;
  el("mlPrevious").disabled = busy || offset === 0;
  el("mlNext").disabled = busy || nextOffset === null;
  for (const id of ["mlFrom", "mlTo", "mlKind", "mlPlatform"]) el(id).disabled = busy;
}
function renderAutomatic(data) {
  automatic = data;
  el("mlAutoEnable").textContent = data.enabled ? "Salvar destino da atualização diária" : "Ativar atualização diária";
  el("mlAutoPause").hidden = !data.enabled;
  el("mlAutoRun").hidden = !data.enabled;
  const destination = state.platforms.find(platform => platform.key === data.platformKey)?.name || data.platformKey;
  let text = data.enabled ? `Atualização diária ativa para ${destination}.` : "Atualização diária desativada. Selecione a plataforma de destino e ative uma vez para começar.";
  if (!data.schedulerConfigured) text += ` ${messages.ml_scheduler_not_configured}`;
  if (data.lastSuccessAt) text += ` Última atualização concluída: ${new Date(data.lastSuccessAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília).`;
  if (data.running) text += " Atualização em andamento.";
  else if (data.pending) text += " Há páginas pendentes. A próxima execução continuará a consulta; você também pode usar Atualizar vendas agora. O dashboard só muda após a consulta completa.";
  if (data.lastError) text += ` Última tentativa: ${errorMessage(new Error(data.lastError))}`;
  el("mlAutoStatus").textContent = text;
}
async function runAutomatic(user, version) {
  if (!await window.dashboard.saveNow()) throw new Error("ml_save_pending");
  if (user !== state.auth?.username || version !== revision) return;
  const result = await apiRequest(`${BASE}/auto-sync/run`, { method: "POST" });
  if (user !== state.auth?.username || version !== revision) return;
  renderAutomatic(result.status);
  if (result.failed) throw new Error(result.error);
  if (result.completed) {
    resetDashboardPreview();
    if (!await window.dashboard.loadBusinessStateFromServer({ quiet: true })) throw new Error("ml_dashboard_reload_failed");
    toastSuccess("Vendas do Mercado Livre atualizadas no dashboard.");
  }
}
function resetDashboardPreview() {
  dashboardPreview = null;
  el("mlDashboardPreview").hidden = true;
  el("mlDashboardDays").replaceChildren();
}
function renderPlatforms() {
  const select = el("mlPlatform");
  const selected = select.value;
  select.replaceChildren(new Option("Selecione a plataforma de destino", ""));
  const platforms = state.platforms.filter(platform => !platform.archived);
  platforms.forEach(platform => select.add(new Option(platform.name, platform.key)));
  const matches = platforms.filter(platform => /mercado[\s_-]*livre/i.test(`${platform.name} ${platform.key}`));
  select.value = platforms.some(platform => platform.key === selected) ? selected : matches.length === 1 ? matches[0].key : "";
}
async function prepareDashboard(user, version) {
  resetDashboardPreview();
  const input = { ...params(), platformKey: el("mlPlatform").value };
  if (!input.platformKey) throw new Error("ml_platform_required");
  if (!await window.dashboard.saveNow()) throw new Error("ml_save_pending");
  if (user !== state.auth?.username || version !== revision) return;
  const data = await apiRequest(`${BASE}/dashboard/preview`, { method: "POST", body: JSON.stringify(input) });
  if (user !== state.auth?.username || version !== revision) return;
  dashboardPreview = { input, data };
  el("mlDashboardPreview").hidden = false;
  el("mlDashboardTotals").textContent = `${data.platform.name}: vendas brutas ${money(data.grossCents)} em ${data.orders} pedidos; devoluções e cancelamentos ${money(data.refundCents || 0)}; saldo ${money(data.netCents ?? data.grossCents)} · ${data.from.split("-").reverse().join("/")} a ${data.to.split("-").reverse().join("/")}. ${data.changedDays} dias com alteração; ${data.replacedDays} com lançamentos existentes. ${data.excluded} pedidos excluídos por status, moeda ou desmembramento. ${data.refundEstimates || 0} reembolso(s) de pedidos ainda pagos: valor limitado aos produtos, podendo incluir frete (estimativa).`;
  for (const day of data.days.filter(day => day.amountCents !== day.previousCents || day.orders !== day.previousOrders || (day.refundCents || 0) !== (day.previousRefundCents || 0))) {
    const row = document.createElement("tr");
    cell(row, day.date.split("-").reverse().join("/"));
    cell(row, money(day.previousCents));
    cell(row, money(day.amountCents));
    cell(row, money(day.previousRefundCents || 0));
    cell(row, money(day.refundCents || 0));
    cell(row, day.previousOrders);
    cell(row, day.orders);
    el("mlDashboardDays").append(row);
  }
  if (!data.changedDays) {
    const row = document.createElement("tr");
    cell(row, "O dashboard já corresponde às vendas e aos descontos deste intervalo.").colSpan = 7;
    el("mlDashboardDays").append(row);
  }
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
  if (!connected) resetDashboardPreview();
  renderPlatforms();
  const autoStatus = await apiRequest(`${BASE}/auto-sync`);
  if (requestedOwner !== state.auth?.username || revision !== requestedRevision) return;
  renderAutomatic(autoStatus);
  if (autoStatus.enabled) el("mlPlatform").value = autoStatus.platformKey;
  const setup = status.configuration;
  const issues = setup?.issues || [];
  const wrongBrowserOrigin = Boolean(setup?.appOrigin && setup.appOrigin !== location.origin);
  canConnect = Boolean(status.configured && !wrongBrowserOrigin);
  el("mlConnect").textContent = connected ? "Reconectar conta" : "Conectar Mercado Livre";
  el("mlConnect").hidden = false;
  el("mlDisconnect").hidden = !connected;
  const setupMessages = {
    client_id_missing: "Preencha ML_CLIENT_ID no ambiente do servidor.",
    client_secret_missing: "Preencha ML_CLIENT_SECRET no ambiente do servidor.",
    invalid_encryption_key: "Configure ML_TOKEN_ENCRYPTION_KEY com uma chave de 32 bytes em base64.",
    invalid_app_origin: "Configure APP_ORIGIN com o endereço HTTP ou HTTPS do app.",
    invalid_redirect_uri: "Configure ML_REDIRECT_URI com o endereço de retorno cadastrado no Mercado Livre, terminado em /api/integrations/mercado-livre/callback.",
    origin_mismatch: `APP_ORIGIN usa ${setup?.appOrigin}, mas ML_REDIRECT_URI retorna para ${setup?.redirectOrigin}. Configure ambos para a mesma origem e acesse o app por ela.`
  };
  const details = el("mlConfigurationIssues");
  details.replaceChildren();
  const explanations = issues.map(issue => setupMessages[issue]).filter(Boolean);
  if (wrongBrowserOrigin) explanations.push(`Você está acessando ${location.origin}. A origem configurada é ${setup.appOrigin}; abra o app por essa origem ou ajuste a configuração do servidor.`);
  if (!canConnect) explanations.push("Depois de ajustar as variáveis no servidor, reinicie o app ou faça um novo deploy e atualize esta página.");
  for (const explanation of explanations) {
    const item = document.createElement("li");
    item.textContent = explanation;
    details.append(item);
  }
  details.hidden = explanations.length === 0;
  notice(authorizationProblem || (!canConnect ? "Conexão indisponível: confira os ajustes abaixo para habilitar o botão." : connected
    ? `Conta conectada: ${status.nickname} (${status.sellerId}). Configure a atualização diária abaixo ou sincronize um intervalo manualmente.` : "Conecte sua conta para consultar pedidos e devoluções."));
  el("mlData").hidden = !connected;
  if (connected) await loadRecords(requestedOwner, requestedRevision);
}
export function init() {
  if (!el("mlIntegration")) return;
  if (owner !== state.auth?.username) {
    owner = state.auth?.username || "";
    authorizationProblem = "";
    revision++;
    connected = false;
    automatic = null;
    resetDashboardPreview();
    el("mlPlatform").value = "";
    canConnect = false;
    el("mlConfigurationIssues").replaceChildren();
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
    el("mlAutoEnable").addEventListener("click", () => void run(async (user, version) => {
      if (!await window.dashboard.saveNow()) throw new Error("ml_save_pending");
      if (user !== state.auth?.username || version !== revision) return;
      const data = await apiRequest(`${BASE}/auto-sync`, { method: "POST", body: JSON.stringify({ enabled: true, platformKey: el("mlPlatform").value }) });
      if (user !== state.auth?.username || version !== revision) return;
      renderAutomatic(data);
      toastSuccess("Atualização diária ativada. Buscando as vendas agora.");
      await runAutomatic(user, version);
    }));
    el("mlAutoPause").addEventListener("click", () => void run(async (user, version) => {
      const data = await apiRequest(`${BASE}/auto-sync`, { method: "POST", body: JSON.stringify({ enabled: false }) });
      if (user !== state.auth?.username || version !== revision) return;
      renderAutomatic(data);
      toastSuccess("Atualização diária pausada. As vendas já importadas foram preservadas.");
    }));
    el("mlAutoRun").addEventListener("click", () => void run(runAutomatic));
    el("mlConnect").addEventListener("click", () => void run(async (user, version) => {
      authorizationProblem = "";
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
    el("mlPrepareDashboard").addEventListener("click", () => void run(prepareDashboard));
    el("mlPlatform").addEventListener("change", () => { resetDashboardPreview(); controls(); });
    el("mlApplyDashboard").addEventListener("click", () => void run(async (user, version) => {
      if (!dashboardPreview) return;
      const prepared = dashboardPreview;
      showGlobalLoader();
      try {
        if (!await window.dashboard.saveNow()) throw new Error("ml_save_pending");
        if (user !== state.auth?.username || version !== revision) return;
        const result = await apiRequest(`${BASE}/dashboard/apply`, { method: "POST",
          body: JSON.stringify({ ...prepared.input, fingerprint: prepared.data.fingerprint }) });
        if (user !== state.auth?.username || version !== revision) return;
        resetDashboardPreview();
        if (!await window.dashboard.loadBusinessStateFromServer({ quiet: true })) throw new Error("ml_dashboard_reload_failed");
        const month = result.months[0];
        await window.dashboard.ensurePeriod(month);
        if (user !== state.auth?.username || version !== revision) return;
        state.currentMonth = month;
        state.activeTab = "overview";
        window.dashboard.setActiveScreen("dashboard");
        window.dashboard.renderScreen();
        toastSuccess("Vendas e pedidos do Mercado Livre atualizados no dashboard.");
      } catch (error) { resetDashboardPreview(); throw error; }
      finally { hideGlobalLoader(); }
    }));
    el("mlPrevious").addEventListener("click", () => void run(async (user, version) => { offset = Math.max(0, offset - 50); await loadRecords(user, version); }));
    el("mlNext").addEventListener("click", () => void run(async (user, version) => { offset = nextOffset ?? 0; await loadRecords(user, version); }));
    el("mlSync").addEventListener("click", () => void run(async (user, version) => {
      const input = params();
      resetDashboardPreview();
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
      if (input.kind === "orders" && el("mlPlatform").value) await prepareDashboard(user, version);
    }));
    for (const id of ["mlFrom", "mlTo", "mlKind"]) el(id).addEventListener("change", () => {
      offset = 0;
      resume = null;
      resetDashboardPreview();
      el("mlSync").textContent = "Sincronizar intervalo";
      notice("Consultando o histórico local. Use Sincronizar intervalo para atualizar os dados pela API.");
      void run(loadRecords);
    });
  }
  const outcome = new URLSearchParams(location.search).get("ml");
  if (outcome) {
    const url = new URL(location.href);
    if (outcome === "failed") {
      const code = url.searchParams.get("ml_error");
      authorizationProblem = Object.prototype.hasOwnProperty.call(messages, code) ? messages[code] : messages.ml_callback_failed;
      toastError(authorizationProblem);
    } else { authorizationProblem = ""; }
    url.searchParams.delete("ml");
    url.searchParams.delete("ml_error");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  void run(refresh);
}
