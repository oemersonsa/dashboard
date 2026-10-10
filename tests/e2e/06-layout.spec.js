import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function capture(page, name) {
  await page.evaluate(() => {
    Object.values(window.Chart?.instances || {}).forEach(chart => { chart.stop(); chart.update("none"); });
    document.querySelectorAll(".toast.show").forEach(toast => toast.classList.remove("show"));
  });
  await page.screenshot({ path: `output/design/${name}.png`, fullPage: true, animations: "disabled" });
}

test.describe("Layout Kanri", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1586, height: 1000 });
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.click("#authModeCreateButton");
    await page.fill("#authUsername", `layout_${Date.now()}`);
    await page.fill("#authPassword", "senha-segura-1234");
    await page.click("#authSubmitButton");
    await expect(page.locator("#setupScreen")).toBeVisible();
    for (const [name, short, color] of [["Mercado Livre", "ML", "#ffda37"], ["Shopee", "SH", "#fc6334"], ["Shein", "S", "#101010"]]) {
      await page.fill("#platformName", name); await page.fill("#platformShort", short);
      await page.fill("#platformColor", color); await page.click("#addPlatformConfigButton");
    }
    await page.click("#finishSetupButton");
    await expect(page.locator("#hubScreen")).toBeVisible();
    await page.evaluate(async () => {
      const app = window.dashboard;
      await app.ensureHistory();
      const month = "2026-Setembro";
      app.state.db[month] = { days: Array.from({ length: 30 }, (_, index) => ({
        d: `${String(index + 1).padStart(2, "0")}/09`,
        "mercado-livre": 1800 + index * 20, shopee: 900 + index * 12, shein: 600 + index * 7,
        "orders_mercado-livre": 14 + index % 6, orders_shopee: 8 + index % 4, orders_shein: 5 + index % 3
      })), returns: { "mercado-livre": 1800, shopee: 1200, shein: 670 } };
      app.state.currentMonth = month; app.state.goals[month] = { target: 150000 };
      app.state.pricing.productCost = 35; app.state.pricing.packagingCost = 2;
      await app.saveNow(); app.setActiveScreen("hub"); app.renderScreen();
    });
    await mkdir("output/design", { recursive: true });
  });

  test("compartilha o menu e a identidade visual nas telas de desktop", async ({ page }) => {
    test.setTimeout(90000);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await expect(page.locator("body")).toHaveClass(/dark-theme/);
    await expect(page.locator(".app > #dashboardSidebar")).toBeVisible();
    await capture(page, "inicio");
    await page.locator('.sidebar-item[data-dashboard-tab="overview"]').click();
    await page.waitForFunction(() => window.Chart?.getChart(document.getElementById("overviewTrendChart")));
    await capture(page, "visao-geral");
    await page.evaluate(() => {
      window.originalOverviewPlatforms = window.dashboard.state.platforms;
      window.originalOverviewMonth = window.dashboard.state.db[window.dashboard.state.currentMonth];
    });
    let originalTrendHeight;
    for (const count of [3, 8, 12, 3]) {
      await page.evaluate(count => {
        const app = window.dashboard;
        app.state.platforms = Array.from({ length: count }, (_, index) => window.originalOverviewPlatforms[index] || { key: `overview-${index}`, name: `Plataforma ${index + 1}`, icon: `P${index + 1}`, color: "#1bd9eb", iconText: "#05222b" });
        app.state.db[app.state.currentMonth] = structuredClone(window.originalOverviewMonth);
        app.state.platforms.slice(3).forEach((platform, index) => { app.state.db[app.state.currentMonth].days[0][platform.key] = 1000 + index * 100; });
        app.renderScreen();
      }, count);
      await expect(page.locator("#platformBars .marketplace-item")).toHaveCount(count);
      await page.waitForFunction(() => {
        const canvas = document.getElementById("overviewTrendChart");
        const chart = window.Chart?.getChart(canvas);
        return chart && Math.abs(chart.height - canvas.clientHeight) < 2;
      }, null, { timeout: 10000 }).catch(async error => {
        console.log("Dimensões do gráfico", await page.evaluate(() => {
          const canvas = document.getElementById("overviewTrendChart");
          const chart = window.Chart?.getChart(canvas);
          return { height: chart?.height, canvasHeight: canvas.clientHeight, parentHeight: canvas.parentElement.clientHeight, cardHeight: canvas.closest(".card").clientHeight };
        }));
        throw error;
      });
      const geometry = await page.locator(".dashboard-main").evaluate(main => {
        const kpis = main.querySelector("#kpiRow").getBoundingClientRect();
        const trend = main.querySelector(".overview-trend-card").getBoundingClientRect();
        const marketplaces = main.querySelector(".overview-platform-card").getBoundingClientRect();
        const chart = main.querySelector(".overview-trend-chart-box").getBoundingClientRect();
        return { gap: trend.top - kpis.bottom, bottom: trend.bottom - marketplaces.bottom, height: chart.height, chartBottom: trend.bottom - chart.bottom };
      });
      expect(geometry.gap).toBeCloseTo(16, 0);
      expect(geometry.bottom).toBeCloseTo(0, 0);
      expect(geometry.chartBottom).toBeCloseTo(23, 0);
      if (count === 3) originalTrendHeight = geometry.height;
      else expect(geometry.height).toBeGreaterThan(originalTrendHeight);
      if (count === 8) await capture(page, "visao-geral-8-plataformas");
    }
    await page.evaluate(() => {
      window.dashboard.state.platforms = window.originalOverviewPlatforms;
      window.dashboard.state.db[window.dashboard.state.currentMonth] = window.originalOverviewMonth;
      delete window.originalOverviewPlatforms; delete window.originalOverviewMonth;
      window.dashboard.renderScreen();
    });
    for (const [tab, ready] of [["entries", "#sale_mercado-livre"], ["daily", "#dailyCardTotal"], ["weekly", "#weekBars"], ["platforms", "#platformConceptCards > *"], ["trends", "#trendsTable > *"], ["projection", "#goalProgressArea > *"], ["calculator", ".pricing-result"], ["roas", "#roasCosts > *"]]) {
      await page.locator(`.sidebar-item[data-dashboard-tab="${tab}"]`).click();
      await expect(page.locator(ready).first()).toBeVisible();
      if (tab === "entries") {
        await page.fill("#sale_mercado-livre", "2.450,00");
        const form = await page.locator(".entry-fields").boundingBox();
        const review = await page.locator(".entry-review").boundingBox();
        expect(review.x).toBeGreaterThan(form.x + form.width);
      }
      if (tab === "projection") await page.waitForFunction(() => window.Chart?.getChart(document.getElementById("goalProjectionChart")));
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1586);
      await capture(page, tab);
      if (tab === "platforms") {
        const platformName = page.locator(".concept-platform-share .platform-badge > span:last-child").first();
        const originalName = await platformName.textContent();
        await platformName.evaluate(name => { name.textContent = "Mercado Livre (Paraíso)"; });
        const participation = await page.locator(".concept-platform-share").evaluate(list => [...list.children].map(row => {
          const bar = row.querySelector(".marketplace-track").getBoundingClientRect();
          return { left: bar.left, width: bar.width, height: row.getBoundingClientRect().height };
        }));
        participation.forEach(row => {
          expect(Math.abs(row.left - participation[0].left)).toBeLessThan(1);
          expect(Math.abs(row.width - participation[0].width)).toBeLessThan(1);
          expect(Math.abs(row.height - participation[0].height)).toBeLessThan(1);
        });
        expect(await platformName.evaluate(name => name.getBoundingClientRect().height / parseFloat(getComputedStyle(name).lineHeight))).toBeCloseTo(2, 1);
        await capture(page, "plataformas-nome-longo");
        await platformName.evaluate((name, original) => { name.textContent = original; }, originalName);
        await page.evaluate(() => { window.layoutOriginalPlatforms = window.dashboard.state.platforms; });
        for (const [count, expectedRows] of [[8, [4, 4]], [6, [3, 3]], [7, [4, 3]], [2, [2]], [1, [1]]]) {
          await page.evaluate(count => {
            const originals = window.layoutOriginalPlatforms;
            window.dashboard.state.platforms = Array.from({ length: count }, (_, index) => originals[index] || { key: `layout-${index}`, name: `Plataforma ${index + 1}`, icon: `P${index + 1}`, color: "#1bd9eb", iconText: "#05222b" });
            window.dashboard.renderScreen();
          }, count);
          await expect(page.locator("#platformConceptCards > article")).toHaveCount(count);
          const rows = await page.locator("#platformConceptCards").evaluate(grid => {
            const grouped = new Map();
            for (const card of grid.children) {
              const box = card.getBoundingClientRect();
              const top = Math.round(box.top);
              if (!grouped.has(top)) grouped.set(top, []);
              grouped.get(top).push(box);
            }
            const bounds = grid.getBoundingClientRect();
            return [...grouped.values()].map(cards => ({ count: cards.length, left: cards[0].left - bounds.left, right: bounds.right - cards.at(-1).right }));
          });
          expect(rows.map(row => row.count)).toEqual(expectedRows);
          rows.forEach(row => { expect(Math.abs(row.left)).toBeLessThan(1); expect(Math.abs(row.right)).toBeLessThan(1); });
          if (count === 8) await capture(page, "plataformas-8-cards");
        }
        await page.evaluate(() => {
          window.dashboard.state.platforms = window.layoutOriginalPlatforms;
          delete window.layoutOriginalPlatforms;
          window.dashboard.renderScreen();
        });
      }
    }
    await page.locator("#sidebarOpenDailyClose").click();
    await page.fill("#dailyCloseSales_mercado-livre", "2.329,99 + 120,00");
    await page.fill("#dailyCloseReturns_mercado-livre", "199,90");
    await expect(page.locator("#dashboardSidebar")).toBeVisible();
    await capture(page, "fechamento");
    await page.locator('.sidebar-item[data-screen-nav="account"]').click();
    await expect(page.locator("#accountScreen")).toBeVisible();
    await capture(page, "conta");
    await page.click('[data-theme-choice="light"]');
    await expect(page.locator("body")).toHaveClass(/light-theme/);
    await page.reload();
    await expect(page.locator("body")).toHaveClass(/light-theme/);
    await page.click('[data-theme-choice="dark"]');
    await page.click("#sidebarManagePlatformsButton");
    await expect(page.locator("#setupScreen")).toBeVisible();
    await expect(page.locator("#accountScreen")).not.toBeVisible();
    await expect(page.locator("#dashboardSidebar")).toBeVisible();
    await page.evaluate(() => {
      window.managementOriginalPlatforms = window.dashboard.state.platforms;
      const names = ["Magalu", "Nuvem Shop", "TikTok", "Mercado Livre (Paraíso)", "Shopee (Paraíso)"];
      window.dashboard.state.platforms = [...window.managementOriginalPlatforms, ...names.map((name, index) => ({ key: `management-${index}`, name, icon: "PL", color: "#1bd9eb", iconText: "#05222b" }))];
      window.dashboard.openSetupScreen();
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator("#platformConfigList > .setup-item")).toHaveCount(8);
    const setupForm = await page.locator(".setup-form-card").boundingBox();
    const setupList = await page.locator(".platform-config-card").boundingBox();
    const setupHeading = await page.locator("#setupScreen .workspace-heading").boundingBox();
    expect(Math.abs(setupHeading.x - setupForm.x)).toBeLessThan(1);
    expect(setupList.x).toBeGreaterThan(setupForm.x + setupForm.width);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(720);
    await capture(page, "gerenciar-plataformas");
    await page.locator("[data-edit-platform]").first().click();
    await expect(page.locator("#platformFormTitle")).toHaveText("Editar plataforma");
    await expect(page.locator("#platformName")).toHaveValue("Mercado Livre");
    await page.click("#cancelPlatformEditButton");
    await expect(page.locator("#platformFormTitle")).toHaveText("Adicionar plataforma");
    await page.evaluate(() => { window.dashboard.state.platforms = window.managementOriginalPlatforms; delete window.managementOriginalPlatforms; });
    await page.click("#finishSetupButton");
    await expect(page.locator("#hubScreen")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("menu móvel funciona entre telas e os formulários cabem na largura", async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("#dashboardSidebar")).not.toBeVisible();
    await page.click("#hubMenuButton");
    await page.locator('.sidebar-item[data-dashboard-tab="entries"]').click();
    await expect(page.locator("#dashboardSidebar")).not.toBeVisible();
    await page.fill("#sale_mercado-livre", "77,50");
    const form = await page.locator(".entry-fields").boundingBox();
    const review = await page.locator(".entry-review").boundingBox();
    expect(review.y).toBeGreaterThan(form.y + form.height);
    await capture(page, "lancamentos-mobile");
    await page.click("#menuToggleButton");
    await page.locator("#sidebarOpenDailyClose").click();
    await page.click("#dailyCloseMenuButton");
    await page.locator('.sidebar-item[data-screen-nav="account"]').click();
    await expect(page.locator("#accountScreen")).toBeVisible();
    await page.click("#accountMenuButton");
    await page.locator('.sidebar-item[data-dashboard-tab="calculator"]').click();
    await expect(page.locator(".pricing-result")).toBeVisible();
    for (const input of await page.locator('#dashboard-panel-calculator input:visible, #dashboard-panel-calculator select:visible').all()) {
      const box = await input.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(391);
    }
    await capture(page, "calculadora-mobile");
    for (const tab of ["overview", "daily", "weekly", "platforms", "trends", "projection", "roas"]) {
      await page.click("#menuToggleButton");
      await page.locator(`.sidebar-item[data-dashboard-tab="${tab}"]`).click();
      await expect(page.locator(`#dashboard-panel-${tab}`)).toBeVisible();
      if (tab === "overview") {
        await page.locator(".kpi-card--returns").focus();
        expect(await page.locator(".kpi-card--returns .kpi-comparison-tooltip").boundingBox().then(box => box.x + box.width)).toBeLessThanOrEqual(390);
        await page.locator(".kpi-card--returns").evaluate(card => card.blur());
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `Largura da tela ${tab}`).toBeLessThanOrEqual(390);
      if (["projection", "roas"].includes(tab)) await capture(page, `${tab}-mobile`);
    }
    await page.click("#menuToggleButton");
    await page.click("#sidebarManagePlatformsButton");
    await expect(page.locator("#setupScreen")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await capture(page, "gerenciar-plataformas-mobile");
    await page.click("#setupMenuButton");
    await page.locator('.sidebar-item[data-screen-nav="hub"]').click();
    await expect(page.locator("#hubScreen")).toBeVisible();
  });
});
