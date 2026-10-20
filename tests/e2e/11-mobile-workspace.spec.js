import { test, expect } from "@playwright/test";

test("mobile: navegação inferior, telas, lançamentos e retorno ao desktop", async ({ page, request }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  const username = `mobile_${Date.now()}`;
  const registration = await request.post("/api/auth/register", { data: { username, password: "senha-segura-1234" } });
  const { sessionToken } = await registration.json();
  expect((await request.patch("/api/auth/profile", { headers: { Authorization: `Bearer ${sessionToken}` }, data: { displayName: "Emerson", avatarData: null } })).ok()).toBeTruthy();
  const platforms = [{ key: "mercado-livre", name: "Mercado Livre", icon: "ML", color: "#ffe600" }, { key: "shopee", name: "Shopee", icon: "SH", color: "#fb6334" }, { key: "shein", name: "Shein", icon: "S", color: "#555555" }];
  const data = { platforms, currentMonth: "2026-Outubro", activeTab: "overview", currentScreen: "hub", goals: { "2026-Outubro": { target: 80000 } },
    db: { "2026-Outubro": { days: Array.from({ length: 20 }, (_, index) => ({ d: `${String(index + 1).padStart(2, "0")}/10`, "mercado-livre": 1800 + index * 20, "orders_mercado-livre": 12, shopee: 800, orders_shopee: 5, shein: 350, orders_shein: 2 })), returns: {} },
      "2026-Setembro": { days: [{ d: "01/09", "mercado-livre": 5000, "orders_mercado-livre": 30, shopee: 2000, orders_shopee: 10, shein: 500, orders_shein: 4 }], returns: {} } } };
  expect((await request.post("/api/state", { headers: { Authorization: `Bearer ${sessionToken}` }, data: { state: data } })).ok()).toBeTruthy();
  await page.addInitScript(({ username, sessionToken }) => {
    localStorage.setItem("dashboard-vendas-session-v1", JSON.stringify({ username, provider: "local", serverSessionToken: sessionToken, expiresAt: Date.now() + 86400000 }));
    localStorage.setItem("dashboard-vendas-auth-v2", JSON.stringify({ auth: { username, provider: "local" }, currentScreen: "hub" }));
  }, { username, sessionToken });
  const base = "/api/integrations/mercado-livre";
  await page.route(`**${base}**`, async route => {
    const url = new URL(route.request().url());
    let response;
    if (url.pathname === base) response = { configured: true, connected: true, accounts: [{ sellerId: "123", nickname: "Loja principal" }, { sellerId: "456", nickname: "Loja secundária" }], configuration: { issues: [], appOrigin: url.origin } };
    else if (url.pathname.endsWith("/auto-sync")) response = { enabled: true, schedulerConfigured: true, platformKey: url.searchParams.get("sellerId") === "123" ? "mercado-livre" : "shopee", lastSuccessAt: "2026-10-20T09:02:00Z" };
    else if (url.pathname.endsWith("/margins")) response = { records: [], total: 0, nextOffset: null, summary: { calculated: 0, pending: 0, salesCents: 0, profitCents: 0, marginPercent: null, estimated: 0 } };
    else if (url.pathname.endsWith("/records")) response = { records: [], total: 0, nextOffset: null, summary: { paidCents: 0, refundedCents: 0 } };
    else return route.abort();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(response) });
  });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const nav = name => page.locator(`#mobileBottomNav [data-mobile-nav="${name}"]`);
  const capture = async name => {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), name).toBeLessThanOrEqual(390);
    await expect(page.locator("#mobileBottomNav")).toBeVisible();
    await expect(page.locator(".global-loader")).toHaveCount(0);
    await page.evaluate(() => document.querySelectorAll(".toast.show").forEach(element => element.classList.remove("show")));
    await page.screenshot({ path: `output/design/mobile-v3-${name}.png`, animations: "disabled" });
  };
  const more = async () => { await nav("more").click(); await expect(page.locator("#mobileMore")).toBeVisible(); };
  await page.goto("/#/hub?month=2026-Outubro");
  await expect(page.locator("#mobileHubSummary")).toContainText("20 de 31");
  await expect(page.locator("#dashboardSidebar")).toBeHidden();
  await expect(page.locator("#mobileBottomNav button")).toHaveCount(5);
  await capture("inicio");
  await nav("panel").click();
  await expect(page.locator("#dashboard-panel-overview")).toBeVisible();
  await capture("overview");
  await nav("register").click();
  await page.fill("#inputDate", "2026-10-21");
  await page.fill("#sale_mercado-livre", "100,00");
  await page.fill("#orders_mercado-livre", "2");
  await capture("registrar");
  await page.click("#registerSaleButton");
  await expect.poll(() => page.evaluate(() => window.dashboard.state.db["2026-Outubro"].days.find(day => day.d === "21/10")?.["mercado-livre"])).toBe(100);
  await more(); await page.locator('#mobileMore [data-mobile-tab="entries"]').click();
  await expect(page.locator("#mobileEntryHistory")).toContainText("21/10");
  await expect(page.locator("#mobileEntryHistory .mobile-day-card").first()).toContainText("100,00");
  await capture("lancamentos");
  await page.locator("#mobileEntryHistory [data-mobile-edit-day]").first().click();
  await expect(page.locator("#dailyDetailsModal")).toHaveClass(/open/);
  await expect(page.locator("#dailyDetailsTable")).toHaveClass(/mobile-card-table/);
  await page.locator('[data-close-modal="dailyDetailsModal"]').click();
  for (const tab of ["daily", "weekly", "platforms", "orders", "comparison", "trends", "projection", "calculator", "roas"]) {
    await more();
    if (["calculator", "roas"].includes(tab)) {
      const tools = page.locator("#mobileMore details").nth(1);
      if (!await tools.evaluate(element => element.open)) await tools.locator("summary").click();
    }
    await page.locator(`#mobileMore [data-mobile-tab="${tab}"]`).click();
    await expect(page.locator(`#dashboard-panel-${tab}`)).toBeVisible();
    if (tab === "platforms") await expect(page.locator("#platformConceptCards")).not.toBeEmpty();
    if (tab === "calculator") {
      await capture("preco-produto");
      await page.locator('.mobile-price-tabs [data-mobile-price="costs"]').click();
      await page.fill("#pricingProductCost", "70");
      await page.fill("#pricingPackagingCost", "3");
      await capture("preco-custos");
      await page.locator('.mobile-price-tabs [data-mobile-price="result"]').click();
      await expect(page.locator(".pricing-result")).toBeVisible();
    }
    if (tab === "orders") await expect(page.locator("#orderMarginFilters")).toBeVisible();
    await capture(tab);
  }
  await more(); await capture("mais");
  await page.locator('#mobileMore [data-mobile-screen="dailyClose"]').click();
  await expect(page.locator("#dailyClosePlatformGrid")).not.toBeEmpty(); await capture("fechamento");
  await nav("connections").click(); await expect(page.locator(".ml-account-card")).toHaveCount(2); await capture("conexoes");
  await page.locator("#mlManual summary").click(); await capture("sincronizacao-manual");
  await more(); await page.locator('#mobileMore [data-mobile-screen="reports"]').click();
  await expect(page.locator("#mobileReports")).toContainText("Gerar relatório"); await capture("relatorios");
  await page.locator('[data-mobile-action="report"]').click(); await expect(page.locator("#reportModal")).toHaveClass(/open/);
  await page.locator('#reportModal [data-close-modal]').click();
  await more(); await page.locator('#mobileMore [data-mobile-screen="backups"]').click(); await capture("backups");
  const download = page.waitForEvent("download"); await page.locator('[data-mobile-action="export-backup"]').click();
  expect((await download).suggestedFilename()).toContain("backup");
  await page.locator('[data-mobile-action="import-backup"]').click(); await expect(page.locator("#importBackupModal")).toHaveClass(/open/);
  await page.locator('#importBackupModal .mclose').click();
  await more(); await page.locator('[data-mobile-action="platforms"]').click(); await expect(page.locator("#setupScreen")).toBeVisible();
  await capture("gerenciar-plataformas");
  // The mobile back button is available while the original setup topbar is hidden.
  await page.locator('[data-mobile-action="back"]').click();
  await page.locator(".mobile-avatar").click(); await expect(page.locator("#accountScreen")).toBeVisible(); await capture("perfil");
  await page.locator('[data-mobile-account="security"]').click(); await expect(page.locator("#accountCurrentPassword")).toBeVisible(); await capture("seguranca");
  await page.locator('[data-mobile-account="appearance"]').click(); await expect(page.locator(".appearance-options")).toBeVisible(); await capture("aparencia");
  await nav("hub").click(); await page.locator('#mobileHubSummary [data-open-sales-import]').click();
  await expect(page.locator("#salesSheetImportModal")).toHaveClass(/open/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "output/design/mobile-v3-importar.png", animations: "disabled" });
  await page.locator('#salesSheetImportModal .mclose').click();
  await page.selectOption("#mobilePeriodSelect", "2026-Setembro");
  await expect(page.locator("#mobileHubSummary")).toContainText("1 de 30");
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await nav("hub").click();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const lastAction = await page.locator(".mobile-hub-actions .mobile-menu-row").last().boundingBox();
    const bottomNav = await page.locator("#mobileBottomNav").boundingBox();
    expect(lastAction.y + lastAction.height).toBeLessThanOrEqual(bottomNav.y);
    for (const tab of ["overview", "calculator", "roas", "comparison", "orders"]) {
      await more(); await page.locator(`#mobileMore [data-mobile-tab="${tab}"]`).click();
      await expect(page.locator(`#dashboard-panel-${tab}`)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${tab} em ${width}px`).toBeLessThanOrEqual(width);
    }
  }
  await nav("hub").click();
  await page.setViewportSize({ width: 1586, height: 1000 });
  await expect(page.locator("#mobileBottomNav")).toBeHidden(); await expect(page.locator("#mobileAppHeader")).toBeHidden();
  await expect(page.locator("#dashboardSidebar")).toBeVisible(); await expect(page.locator(".hub-topbar")).toBeVisible();
  await expect(page.locator(".hub-month-summary")).toBeVisible();
  await page.locator('[data-screen-nav="account"]').click();
  await expect(page.locator("#accountProfileHeading")).toBeVisible(); await expect(page.locator("#accountPasswordHeading")).toBeVisible(); await expect(page.locator(".account-appearance")).toBeVisible();
  expect(errors).toEqual([]);
});
