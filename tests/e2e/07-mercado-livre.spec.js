import { test, expect } from "@playwright/test";

test("consulta pedidos, sincroniza e acompanha devoluções no desktop e celular", async ({ page }) => {
  await page.setViewportSize({ width: 1586, height: 1000 });
  const base = "/api/integrations/mercado-livre";
  const syncPages = [];
  let failSecondPage = true;
  await page.route(`**${base}**`, async route => {
    const url = new URL(route.request().url());
    let body;
    if (url.pathname === base) body = { configured: true, connected: true, nickname: "Loja teste", sellerId: "123" };
    else if (url.pathname.endsWith("/records")) {
      const claims = url.searchParams.get("kind") === "claims";
      body = { records: claims
        ? [{ id: "456", dateCreated: "2026-10-03T12:00:00-03:00", type: "return", resource: "order", resourceId: "111", reason: "PDD", status: "opened", hasReturn: true }]
        : [{ id: "111", dateCreated: "2026-10-03T12:00:00-03:00", status: "paid", currency: "BRL", grossCents: 2468, refundedCents: 500,
          items: [{ quantity: 2, title: "Produto <script>alert(1)</script>", sku: "SKU" }] }],
      total: 1, nextOffset: null, summary: { paidCents: 2468, refundedCents: 500 } };
    } else if (url.pathname.endsWith("/sync")) {
      const input = route.request().postDataJSON();
      syncPages.push(input.offset);
      if (input.offset === 50 && failSecondPage) {
        failSecondPage = false;
        return route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "ml_rate_limited" }) });
      }
      body = { count: input.offset === 0 ? 50 : 1, total: 51, nextOffset: input.offset === 0 ? 50 : null };
    } else if (url.pathname.endsWith("/return")) body = { id: "789", status: "pending", shipments: [{ status: "shipped", trackingNumber: "ABC123" }] };
    else return route.abort();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/");
  await page.click("#authModeCreateButton");
  await page.fill("#authUsername", `ml_e2e_${Date.now()}`);
  await page.fill("#authPassword", "senha-segura-1234");
  await page.click("#authSubmitButton");
  await expect(page.locator("#setupScreen")).toBeVisible();
  await page.fill("#platformName", "Mercado Livre");
  await page.fill("#platformShort", "ML");
  await page.click("#addPlatformConfigButton");
  await page.click("#finishSetupButton");
  await expect(page.locator("#hubScreen")).toBeVisible();
  await page.locator('[data-screen-nav="account"]').click();
  await expect(page.locator("#mlNotice")).toContainText("Loja teste");
  await expect(page.locator("#mlRows")).toContainText("Produto <script>alert(1)</script>");
  await expect(page.locator("#mlRows script")).toHaveCount(0);
  await expect(page.locator("#mlSummary")).toContainText("24,68");
  await page.locator("#mlSync").click();
  await expect(page.locator("#mlNotice")).toContainText("Limite de consultas");
  await expect(page.locator("#mlSync")).toHaveText("Continuar sincronização");
  await page.locator("#mlSync").click();
  await expect(page.locator("#mlNotice")).toContainText("Sincronização concluída");
  expect(syncPages).toEqual([0, 50, 50]);
  await page.locator("#mlKind").selectOption("claims");
  await page.getByRole("button", { name: "Consultar devolução" }).click();
  await expect(page.locator("#mlRows")).toContainText("ABC123");
  await page.evaluate(() => document.querySelectorAll(".toast.show").forEach(item => item.classList.remove("show")));
  await page.locator("#mlIntegration").screenshot({ path: "output/design/mercado-livre-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator("#mlIntegration").screenshot({ path: "output/design/mercado-livre-mobile.png" });
});
