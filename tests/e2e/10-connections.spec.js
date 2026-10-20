import { test, expect } from "@playwright/test";

test("gerencia duas contas em Conexões com destinos e controles independentes", async ({ page, request }) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  const username = `connections_${Date.now()}`;
  const registered = await request.post("/api/auth/register", { data: { username, password: "senha-segura-1234" } });
  const { sessionToken } = await registered.json();
  await request.post("/api/state", { headers: { Authorization: `Bearer ${sessionToken}` }, data: { state: {
    platforms: [{ key: "main", name: "Mercado Livre • Loja principal", icon: "ML", color: "#ffe600" }, { key: "second", name: "Mercado Livre • Loja secundária", icon: "ML", color: "#ffe600" }],
    db: {}, goals: {}, currentMonth: "2026-Outubro", currentScreen: "hub"
  } } });
  await page.addInitScript(({ username, sessionToken }) => {
    localStorage.setItem("dashboard-vendas-session-v1", JSON.stringify({ username, provider: "local", serverSessionToken: sessionToken, expiresAt: Date.now() + 86400000 }));
    localStorage.setItem("dashboard-vendas-auth-v2", JSON.stringify({ auth: { username, provider: "local" }, currentScreen: "hub" }));
  }, { username, sessionToken });
  let accounts = [{ sellerId: "123456789", nickname: "Loja principal" }, { sellerId: "987654321", nickname: "Loja secundária" }];
  const jobs = Object.fromEntries(accounts.map((account, index) => [account.sellerId, { enabled: true, schedulerConfigured: true, platformKey: index ? "second" : "main",
    lastSuccessAt: "2026-10-20T09:0" + (index ? "4" : "2") + ":00Z", lastError: null, pending: false }]));
  const calls = [], errors = []; page.on("pageerror", error => errors.push(error.message));
  const base = "/api/integrations/mercado-livre";
  await page.route(`**${base}**`, async route => {
    const url = new URL(route.request().url()), method = route.request().method();
    const input = method === "POST" && route.request().postData() ? route.request().postDataJSON() : {};
    const sellerId = url.searchParams.get("sellerId") || input.sellerId;
    calls.push({ path: url.pathname, method, sellerId });
    let body;
    if (url.pathname === base) {
      if (method === "DELETE") accounts = accounts.filter(account => account.sellerId !== sellerId);
      body = { configured: true, connected: Boolean(accounts.length), accounts, configuration: { issues: [], appOrigin: url.origin } };
    } else if (url.pathname.endsWith("/auto-sync")) {
      if (method === "POST") jobs[sellerId] = { ...jobs[sellerId], ...input };
      body = jobs[sellerId];
    } else if (url.pathname.endsWith("/auto-sync/run")) body = { completed: true, status: jobs[sellerId] };
    else if (url.pathname.endsWith("/records")) body = { records: [], total: 0, nextOffset: null, summary: { paidCents: 0, refundedCents: 0 } };
    else return route.abort();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/#/connections");
  await expect(page.locator("#connectionsScreen")).toBeVisible();
  await expect(page.locator(".ml-account-card")).toHaveCount(2);
  await expect(page.locator("#mlAccountCount")).toHaveText("2 contas conectadas");
  await expect(page.locator("#mlManual")).not.toHaveAttribute("open");
  await expect(page.locator('[data-screen-nav="connections"]')).toHaveAttribute("aria-current", "page");
  expect(await page.locator('[data-screen-nav="account"]').evaluate(el => el.previousElementSibling.dataset.screenNav)).toBe("connections");
  const first = page.locator('.ml-account-card[data-seller-id="123456789"]');
  const second = page.locator('.ml-account-card[data-seller-id="987654321"]');
  await expect(first.locator("select")).toHaveValue("main");
  await expect(second.locator("select")).toHaveValue("second");
  await expect(second.locator('option[value="main"]')).toHaveAttribute("disabled", "");
  await expect(page.locator(".global-loader")).toHaveCount(0);
  await expect(first.locator("select")).toBeEnabled();
  await page.evaluate(() => { document.body.classList.remove("dark-theme"); });
  await page.screenshot({ path: "output/design/connections-desktop.png", fullPage: true, animations: "disabled" });
  await page.evaluate(() => { document.body.classList.add("dark-theme"); });
  await expect(page.locator("#mlConnect")).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.screenshot({ path: "output/design/connections-dark.png", fullPage: true, animations: "disabled" });
  await page.evaluate(() => { document.body.classList.remove("dark-theme"); });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "output/design/connections-mobile.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1536, height: 1024 });
  await first.getByRole("switch").click();
  await expect(first.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  await expect(second.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  await expect(first.locator('[data-action="run"]')).toBeDisabled();
  await second.locator('[data-action="run"]').click();
  await expect(second.locator('[data-action="run"]')).toBeEnabled();
  expect(calls.filter(call => call.path.endsWith("/auto-sync/run")).map(call => call.sellerId)).toEqual(["987654321"]);
  await page.locator("#mlManual summary").click();
  await page.locator("#mlAccount").selectOption("987654321");
  await expect(page.locator("#mlPlatform")).toHaveValue("second");
  await expect(page.locator("#mlAccount")).toBeEnabled();
  expect(calls.filter(call => call.path.endsWith("/records")).at(-1).sellerId).toBe("987654321");
  await page.locator('[data-screen-nav="account"]').click();
  await expect(page.locator("#accountScreen")).toBeVisible();
  await expect(page.locator("#accountScreen #mlIntegration")).toHaveCount(0);
  await page.locator('[data-screen-nav="connections"]').click();
  await expect(first.locator('.ml-account-actions [data-action="disconnect"]')).toBeEnabled();
  await first.locator('.ml-account-actions [data-action="disconnect"]').click();
  await expect(page.locator(".ml-account-card")).toHaveCount(1);
  await expect(second.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#mlAccountCount")).toHaveText("1 conta conectada");
  expect(errors).toEqual([]);
});
