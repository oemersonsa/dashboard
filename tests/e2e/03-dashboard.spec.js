import { test, expect } from "@playwright/test";

const USER = { username: "dash_user", password: "1234" };

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(
      () => window.dashboard && typeof window.dashboard.renderScreen === "function"
    );

    await page.click("#authModeCreateButton");
    await page.fill("#authUsername", USER.username + "_" + Date.now());
    await page.fill("#authPassword", USER.password);
    await page.click("#authSubmitButton");

    await page.waitForFunction(() => {
      const s = document.getElementById("setupScreen");
      return s && !s.hidden;
    }, { timeout: 10000 });

    for (const p of [
      { name: "Mercado Livre", short: "ML" },
      { name: "Shopee", short: "SH" }
    ]) {
      await page.fill("#platformName", p.name);
      await page.fill("#platformShort", p.short);
      await page.click("#addPlatformConfigButton");
    }
    await page.click("#finishSetupButton");

    await page.waitForFunction(() => {
      const s = document.getElementById("hubScreen");
      return s && !s.hidden;
    }, { timeout: 10000 });
  });

  test("navegação hub → dashboard", async ({ page }) => {
    await page.click('[data-nav="dashboard"]');
    await page.waitForFunction(() => !document.getElementById("dashboardScreen").hidden);
    await expect(page.locator("#kpiRow .kpi-card")).toHaveCount(5);
  });

  test("lançar venda atualiza KPI", async ({ page }) => {
    await page.click('[data-nav="dashboard"]');
    await page.waitForFunction(() => !document.getElementById("dashboardScreen").hidden);

    await page.click('[data-dashboard-tab="entries"]');
    await page.waitForSelector("#sale_mercado-livre", { timeout: 10000 });

    await page.fill("#sale_mercado-livre", "1000");
    await page.fill("#orders_mercado-livre", "10");
    await page.click("#registerSaleButton");

    await page.click('[data-dashboard-tab="overview"]');
    const kpi = page.locator("#kpiRow .kpi-card").first();
    await expect(kpi).toContainText("1.000", { timeout: 10000 });
  });

  test("criar novo mês", async ({ page }) => {
    await page.click('[data-nav="dashboard"]');
    await page.waitForFunction(() => !document.getElementById("dashboardScreen").hidden);

    await page.click("#periodPickerButton");
    await page.waitForSelector("#addMonthModal.open", { timeout: 10000 });
    await page.waitForSelector('[data-picker-month="Janeiro"]', { timeout: 10000 });

    await page.fill("#periodYearInput", "2027");
    await page.click('[data-picker-month="Janeiro"]');
    await page.click("#confirmAddMonthButton");

    await expect(page.locator("#sidebarCurrentMonth")).toHaveText("Janeiro", { timeout: 10000 });
    await expect(page.locator("#sidebarCurrentYear")).toHaveText("2027");
  });
});