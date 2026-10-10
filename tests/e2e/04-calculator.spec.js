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
    await page.fill("#authPassword", "senha-segura-1234");
    await page.click("#authSubmitButton");

    await page.waitForFunction(() => {
      const s = document.getElementById("setupScreen");
      return s && !s.hidden;
    }, { timeout: 10000 });

    await page.fill("#platformName", "Mercado Livre");
    await page.fill("#platformShort", "ML");
    await page.click("#addPlatformConfigButton");
    await page.fill("#platformName", "Shopee");
    await page.fill("#platformShort", "SH");
    await page.click("#addPlatformConfigButton");
    await page.click("#finishSetupButton");

    await page.waitForFunction(() => {
      const s = document.getElementById("hubScreen");
      return s && !s.hidden;
    }, { timeout: 10000 });
  });

  test("calcula preço ideal", async ({ page }) => {
    await page.click('[data-nav="calculator"]');
    await expect(page.locator("#dashboard-panel-calculator")).toBeVisible();

    await page.fill("#pricingProductCost", "50");
    await page.fill("#pricingPackagingCost", "5");
    await page.fill("#pricingTargetMargin", "20");

    const result = page.locator(".pricing-card .pricing-result").first();
    await expect(result).toContainText("R$", { timeout: 10000 });
  });

  test("modo margem vs lucro", async ({ page }) => {
    await page.click('[data-nav="calculator"]');
    await expect(page.locator("#dashboard-panel-calculator")).toBeVisible();

    await page.click("#pricingModeProfit");
    await expect(page.locator("#pricingTargetProfitWrap")).toBeVisible();
    await expect(page.locator("#pricingTargetMarginWrap")).toBeHidden();

    await page.click("#pricingModeMargin");
    await expect(page.locator("#pricingTargetMarginWrap")).toBeVisible();
    await expect(page.locator("#pricingTargetProfitWrap")).toBeHidden();
  });

  test("mantém a digitação de valores sem recriar o campo a cada tecla", async ({ page }) => {
    await page.click('[data-nav="calculator"]');
    const cost = page.locator("#pricingProductCost");
    await cost.fill("");
    await cost.pressSequentially("125.50");
    await expect.poll(async () => Number(await cost.inputValue())).toBe(125.5);
    await expect(page.locator("#pricingBaseCost")).toContainText("125,50");
  });

  test("o ROAS muda a faixa com o preço e preserva taxas manuais", async ({ page }) => {
    await page.click('[data-nav="dashboard"]');

    await page.click('[data-dashboard-tab="roas"]');
    await page.locator("#roasPlatform").selectOption("shopee");
    await page.locator("#roasPrice").fill("250");
    await expect(page.locator("#roasFixed")).toHaveValue("26");
    await expect(page.locator("#roasProfileNote")).toContainText("Faixa");
    await expect(page.locator("#roasFixed")).toHaveAttribute("readonly", "");
    await page.locator("#roasManualFees").check();
    await page.locator("#roasFixed").fill("7");
    await page.locator("#roasPrice").fill("50");
    await expect(page.locator("#roasFixed")).toHaveValue("7");
    await page.locator("#roasManualFees").uncheck();
    await expect(page.locator("#roasFixed")).toHaveValue("4");
  });

  test("a Calculadora de ROAS carrega as taxas da plataforma selecionada", async ({ page }) => {
    await page.click('[data-nav="dashboard"]');
    await expect(page.locator("#dashboardScreen")).toBeVisible();

    await page.click('[data-dashboard-tab="roas"]');
    await expect(page.locator("#dashboard-panel-roas")).toBeVisible();
    await expect(page.locator("#roasPlatform option")).toHaveCount(2);

    await page.locator("#roasPlatform").selectOption("shopee");
    await expect(page.locator("#roasCommission")).toHaveValue("14");
    await expect(page.locator("#roasFixed")).toHaveValue("20");
    await expect(page.locator("#roasContribution")).toContainText("52,92");
    await expect(page.locator("#roasAdBudget")).toContainText("12,94");
    await expect(page.locator("#roasTarget")).toHaveText("15.45x");
    await page.locator("#roasCost").fill("200");
    await expect(page.locator("#roasTarget")).toHaveText("Meta não atingível");
    await expect(page.locator("#roasAdBudget")).toContainText("0,00");
  });
});
