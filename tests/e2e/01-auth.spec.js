import { test, expect } from "@playwright/test";

const USER = { username: "e2e_user", password: "1234" };

test.describe("Auth", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(
      () => window.dashboard && typeof window.dashboard.renderScreen === "function"
    );
  });

  test("criar acesso e fazer login", async ({ page }) => {
    await page.click("#authModeCreateButton");
    await page.fill("#authUsername", USER.username + "_" + Date.now());
    await page.fill("#authPassword", USER.password);
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

  test("login rejeita senha errada", async ({ page }) => {
    const u = "errado_" + Date.now();
    await page.click("#authModeCreateButton");
    await page.fill("#authUsername", u);
    await page.fill("#authPassword", USER.password);
    await page.click("#authSubmitButton");

    await page.waitForFunction(() => {
      const s = document.getElementById("setupScreen");
      return s && !s.hidden;
    }, { timeout: 10000 });

    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(
      () => window.dashboard && typeof window.dashboard.renderScreen === "function"
    );

    await page.fill("#authUsername", u);
    await page.fill("#authPassword", "senha_errada");
    await page.click("#authSubmitButton");

    await expect(page.locator("#authScreen")).toBeVisible();
  });
});