import { test, expect } from "@playwright/test";

test.describe("Fechamento Diário", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(
      () => window.dashboard && typeof window.dashboard.renderScreen === "function"
    );

    await page.click("#authModeCreateButton");
    await page.fill("#authUsername", "close_user_" + Date.now());
    await page.fill("#authPassword", "1234");
    await page.click("#authSubmitButton");

    await page.waitForFunction(() => {
      const s = document.getElementById("setupScreen");
      return s && !s.hidden;
    }, { timeout: 10000 });

    await page.fill("#platformName", "Mercado Livre");
    await page.fill("#platformShort", "ML");
    await page.click("#addPlatformConfigButton");
    await page.click("#finishSetupButton");

    await page.waitForFunction(() => {
      const s = document.getElementById("hubScreen");
      return s && !s.hidden;
    }, { timeout: 10000 });
  });

  test("soma valores e gera TXT", async ({ page }) => {
    await page.click('[data-nav="dailyClose"]');
    await page.waitForFunction(() => !document.getElementById("dailyCloseScreen").hidden);
    await page.waitForSelector("#dailyCloseSales_mercado-livre", { timeout: 10000 });

    await page.fill("#dailyCloseSales_mercado-livre", "1000 + 500,50");
    await page.fill("#dailyCloseReturns_mercado-livre", "100");

    const preview = page.locator("#dailyClosePreview");
    await expect(preview).toHaveValue(/Mercado Livre/, { timeout: 10000 });
    await expect(preview).toHaveValue(/1\.500,50/);
  });

  test("limpar limpa os campos", async ({ page }) => {
    await page.click('[data-nav="dailyClose"]');
    await page.waitForFunction(() => !document.getElementById("dailyCloseScreen").hidden);
    await page.waitForSelector("#dailyCloseSales_mercado-livre", { timeout: 10000 });

    await page.fill("#dailyCloseSales_mercado-livre", "1000");
    await page.click("#clearDailyCloseButton");

    await expect(page.locator("#dailyCloseSales_mercado-livre")).toHaveValue("");
  });
});