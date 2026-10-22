import { test, expect } from "@playwright/test";

test("consulta pedidos, sincroniza e acompanha devoluções no desktop e celular", async ({ page }) => {
  await page.setViewportSize({ width: 1586, height: 1000 });
  const base = "/api/integrations/mercado-livre";
  const syncPages = [];
  let failSecondPage = true;
  let setupReady = false;
  let authToken = "";
  let automatic = { enabled: false, schedulerConfigured: true, platformKey: "", lastSuccessAt: null, lastError: null, pending: false };
  await page.route(`**${base}**`, async route => {
    const url = new URL(route.request().url());
    let body;
    if (url.pathname === base) body = { configured: setupReady, connected: setupReady, nickname: "Loja teste", sellerId: "123",
      configuration: { issues: setupReady ? [] : ["origin_mismatch"], appOrigin: url.origin,
        redirectOrigin: setupReady ? url.origin : "https://public.example" } };
    else if (url.pathname.endsWith("/auto-sync")) {
      if (route.request().method() === "POST") automatic = { ...automatic, ...route.request().postDataJSON() };
      body = automatic;
    } else if (url.pathname.endsWith("/auto-sync/run")) {
      automatic = { ...automatic, lastSuccessAt: "2026-10-17T09:00:00Z" };
      body = { completed: true, changedDays: 0, status: automatic };
    } else if (url.pathname.endsWith("/records")) {
      const claims = url.searchParams.get("kind") === "claims";
      body = { records: claims
        ? [{ id: "456", dateCreated: "2026-10-03T12:00:00-03:00", type: "return", resource: "order", resourceId: "111", reason: "PDD", status: "opened", hasReturn: true }]
        : [{ id: "111", dateCreated: "2026-10-03T12:00:00-03:00", status: "paid", currency: "BRL", grossCents: 2468, refundedCents: 500,
          items: [{ quantity: 2, title: "Produto <script>alert(1)</script> Vestido Longo Festa Elegante Tomara Que Caia Fenda Madrinha Verde Oliva", sku: "SKU-VERDE-OLIVA-G-SEM-ESPACOS-123456789012345678901234567890" }] }],
      total: 1, nextOffset: null, summary: { paidCents: 2468, refundedCents: 500 } };
    } else if (url.pathname.endsWith("/sync")) {
      const input = route.request().postDataJSON();
      syncPages.push(input.offset);
      if (input.offset === 50 && failSecondPage) {
        failSecondPage = false;
        return route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "ml_rate_limited" }) });
      }
      body = { count: input.offset === 0 ? 50 : 1, total: 51, nextOffset: input.offset === 0 ? 50 : null };
    } else if (url.pathname.endsWith("/dashboard/preview")) body = { platform: { key: "mercado-livre", name: "Mercado Livre" },
      grossCents: 2468, refundCents: 500, netCents: 1968, orders: 1, from: "2026-10-01", to: "2026-10-17", changedDays: 1, replacedDays: 0, excluded: 0,
      months: ["2026-Outubro"], fingerprint: "preview-fingerprint",
      days: [{ date: "2026-10-03", day: "03/10", month: "2026-Outubro", amountCents: 2468, refundCents: 500, previousRefundCents: 0, previousCents: 0, orders: 1, previousOrders: 0 }] };
    else if (url.pathname.endsWith("/dashboard/apply")) {
      const input = route.request().postDataJSON();
      expect(input.fingerprint).toBe("preview-fingerprint");
      const headers = { Authorization: `Bearer ${authToken}` };
      const state = (await (await page.request.get("/api/state", { headers })).json()).state;
      const patch = await page.request.patch("/api/state", { headers, data: { expectedUpdatedAt: state.updatedAt,
        changes: { months: { "2026-Outubro": { days: [{ d: "03/10", [input.platformKey]: 24.68, [`orders_${input.platformKey}`]: 1, [`refunds_${input.platformKey}`]: 5 }], deletedDays: [], returns: {} } } } } });
      expect(patch.ok()).toBeTruthy();
      body = { ok: true, changedDays: 1, months: ["2026-Outubro"] };
    } else if (url.pathname.endsWith("/return")) body = { id: "789", status: "pending", shipments: [{ status: "shipped", trackingNumber: "ABC123" }] };
    else return route.abort();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/");
  await page.click("#authModeCreateButton");
  await page.fill("#authUsername", `ml_e2e_${Date.now()}`);
  await page.fill("#authPassword", "senha-segura-1234");
  const register = page.waitForResponse(response => response.url().endsWith("/api/auth/register"));
  await page.click("#authSubmitButton");
  authToken = (await (await register).json()).sessionToken;
  await expect(page.locator("#setupScreen")).toBeVisible();
  await page.fill("#platformName", "Mercado Livre");
  await page.fill("#platformShort", "ML");
  await page.click("#addPlatformConfigButton");
  await page.click("#finishSetupButton");
  await expect(page.locator("#hubScreen")).toBeVisible();
  await page.locator('[data-screen-nav="connections"]').click();
  await expect(page.locator("#mlConnect")).toBeVisible();
  await expect(page.locator("#mlConnect")).toBeDisabled();
  await expect(page.locator("#mlConfigurationIssues")).toContainText("APP_ORIGIN");
  await expect(page.locator("#mlConfigurationIssues")).toContainText("https://public.example");
  setupReady = true;
  await page.evaluate(() => { window.dashboard.setActiveScreen("hub"); window.dashboard.renderScreen(); });
  await page.locator('[data-screen-nav="connections"]').click();
  await expect(page.locator("#mlAccounts")).toContainText("Loja teste");
  await page.locator("#mlManual summary").click();
  await expect(page.locator("#mlConnect")).toBeEnabled();
  await expect(page.locator("#mlConfigurationIssues")).toBeHidden();
  await expect(page.locator("#mlRows")).toContainText("Produto <script>alert(1)</script>");
  await expect(page.locator("#mlRows script")).toHaveCount(0);
  await expect(page.locator("#mlSummary")).toContainText("24,68");
  for (const width of [1586, 960, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const layout = await page.locator("#mlRows tr:first-child").evaluate(row => {
      const product = row.cells[3], values = row.cells[4];
      const range = document.createRange(); range.selectNodeContents(product);
      const bounds = product.getBoundingClientRect();
      return { wraps: range.getClientRects().length > 1,
        contained: [...range.getClientRects()].every(rect => rect.left >= bounds.left && rect.right <= bounds.right && (bounds.bottom <= values.getBoundingClientRect().top || rect.right <= values.getBoundingClientRect().left)),
        pageWidth: document.documentElement.scrollWidth };
    });
    expect(layout.wraps).toBe(true);
    expect(layout.contained).toBe(true);
    expect(layout.pageWidth).toBeLessThanOrEqual(width);
  }
  await page.locator(".ml-records-table").screenshot({ path: "output/design/connections-manual-table-mobile.png" });
  await page.setViewportSize({ width: 1586, height: 1000 });
  await page.locator(".ml-records-table").screenshot({ path: "output/design/connections-manual-table-desktop.png" });
  await page.locator("#mlSync").click();
  await expect(page.locator("#mlNotice")).toContainText("Limite de consultas");
  await expect(page.locator("#mlSync")).toHaveText("Continuar sincronização");
  await page.locator("#mlSync").click();
  await expect(page.locator("#mlNotice")).toContainText("Sincronização concluída");
  expect(syncPages).toEqual([0, 50, 50]);
  await expect(page.locator("#mlDashboardPreview")).toBeVisible();
  await expect(page.locator("#mlDashboardTotals")).toContainText("24,68");
  await expect(page.locator("#mlApplyDashboard")).toBeEnabled();
  await page.locator("#mlKind").selectOption("claims");
  await page.getByRole("button", { name: "Consultar devolução" }).click();
  await expect(page.locator("#mlRows")).toContainText("ABC123");
  await page.evaluate(() => document.querySelectorAll(".toast.show").forEach(item => item.classList.remove("show")));
  await page.locator("#mlIntegration").screenshot({ path: "output/design/mercado-livre-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator("#mlIntegration").screenshot({ path: "output/design/mercado-livre-mobile.png" });
  await page.setViewportSize({ width: 1586, height: 1000 });
  await page.locator("#mlKind").selectOption("orders");
  await page.locator("#mlPrepareDashboard").click();
  await expect(page.locator("#mlDashboardPreview")).toBeVisible();
  await page.locator("#mlDashboardPreview").screenshot({ path: "output/design/mercado-livre-dashboard-preview.png" });
  await page.locator("#mlApplyDashboard").click();
  await expect(page.locator("#dashboardScreen")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.dashboard.state.db["2026-Outubro"]?.days.find(day => day.d === "03/10")?.["mercado-livre"])).toBe(24.68);
  await expect.poll(() => page.evaluate(() => window.dashboard.state.currentMonth)).toBe("2026-Outubro");
  await expect(page.locator("#kpiRow")).toContainText("24,68");
  await expect(page.locator(".kpi-card--returns")).toContainText("Devoluções e cancelamentos");
  await expect(page.locator(".kpi-card--returns")).toContainText("5,00");
  await expect(page.locator(".kpi-card--net")).toContainText("19,68");
  await page.locator("#kpiRow").screenshot({ path: "output/design/mercado-livre-gross-refunds.png" });
  await page.locator('[data-screen-nav="connections"]').click();
  await expect(page.locator(".ml-auto-settings")).toContainText("Sincronização manual");
  await expect(page.locator('[role="switch"]')).toHaveCount(0);
  await expect(page.locator('[data-action="run"]')).toHaveCount(0);
  await page.locator(".ml-account-card select").selectOption("mercado-livre");
  await expect(page.locator(".ml-account-card select")).toBeEnabled();
  await page.goto("/?ml=failed&ml_error=ml_oauth_cookie_missing#/connections");
  await expect(page.locator("#mlAccounts")).toContainText("Loja teste");
  await expect(page.locator("#mlNotice")).toContainText("mesmo navegador");
  expect(page.url()).not.toContain("ml_error");
  await expect(page.locator("#mlConnect")).toBeEnabled();
});
