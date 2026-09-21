import { test, expect } from "@playwright/test";

test.describe("Calculadora", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(
      () => window.dashboard && typeof window.dashboard.renderScreen === "function"
    );

    await page.click("#authModeCreateButton");
    await page.fill("#authUsername", "calc_user_" + Date.now());
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

  test("calcula preço ideal", async ({ page }) => {
    await page.click('[data-nav="calculator"]');
    await page.waitForFunction(() => !document.getElementById("calculatorScreen").hidden);

    await page.fill("#pricingProductCost", "50");
    await page.fill("#pricingPackagingCost", "5");
    await page.fill("#pricingTargetMargin", "20");

    const result = page.locator(".pricing-card .pricing-result").first();
    await expect(result).toContainText("R$", { timeout: 10000 });
  });

  test("modo margem vs lucro", async ({ page }) => {
    await page.click('[data-nav="calculator"]');
    await page.waitForFunction(() => !document.getElementById("calculatorScreen").hidden);

    await page.click("#pricingModeProfit");
    await expect(page.locator("#pricingTargetProfitWrap")).toBeVisible();
    await expect(page.locator("#pricingTargetMarginWrap")).toBeHidden();

    await page.click("#pricingModeMargin");
    await expect(page.locator("#pricingTargetMarginWrap")).toBeVisible();
    await expect(page.locator("#pricingTargetProfitWrap")).toBeHidden();
  });
});