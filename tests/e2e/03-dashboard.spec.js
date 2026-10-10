import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const USER = { username: "dash_user", password: "senha-segura-1234" };

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

  test("navega pelo menu com teclado em uma tela pequena", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("#dashboardSidebar")).toBeHidden();
    const dashboard = page.locator('[data-nav="dashboard"]');
    await dashboard.focus(); await dashboard.press("Enter");
    await expect(page.locator("#dashboardScreen")).toBeVisible();
    const toggle = page.locator("#menuToggleButton");
    await toggle.focus(); await toggle.press("Enter");
    await expect(page.locator("#dashboardSidebar")).toHaveClass(/open/);
    const roas = page.locator('[data-dashboard-tab="roas"]');
    await roas.focus(); await roas.press("Enter");
    await expect(page.locator("#dashboard-panel-roas")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
    const kpi = page.locator("#kpiRow .kpi-card--gross");
    await expect(kpi).toContainText("1.000", { timeout: 10000 });
  });

  test("a meta cadastrada aparece continuamente na Visão geral", async ({ page }) => {
    await page.click('[data-nav="dashboard"]');
    await expect(page.locator("#dashboardScreen")).toBeVisible();

    await page.click('[data-dashboard-tab="projection"]');
    await page.locator("#goalInput").fill("50000");
    await page.locator("#goalInput").press("Enter");

    await page.click('[data-dashboard-tab="overview"]');
    const progress = page.getByRole("progressbar", { name: "Progresso da meta de vendas após devoluções" });
    await expect(progress).toBeVisible();
    await expect(progress).toHaveAttribute("aria-valuenow", "0.0");
    await expect(page.locator("#goalAlertBanner")).toContainText("Realizado");
    await expect(page.locator("#goalAlertBanner")).toContainText("Projeção");
  });

  test("alterna a tendência entre 30 dias corridos e o mês selecionado", async ({ page }) => {
    await page.click('[data-nav="dashboard"]');
    await expect(page.locator("#dashboardScreen")).toBeVisible();

    const rolling = page.locator('[data-overview-trend-period="rolling30"]');
    const month = page.locator('[data-overview-trend-period="month"]');
    await month.click();
    await expect(month).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#overviewTrendSubtitle")).toContainText("Mês selecionado");

    await rolling.click();
    await expect(rolling).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#overviewTrendSubtitle")).toContainText("30 dias corridos");
  });

  test("abre tendências e atualiza a métrica selecionada", async ({ page }) => {
    await page.click('[data-nav="dashboard"]');
    await expect(page.locator("#dashboardScreen")).toBeVisible();

    await page.click('[data-dashboard-tab="trends"]');
    await expect(page.locator("#dashboard-panel-trends")).toBeVisible();
    await expect(page.locator("#trendsTable")).toContainText("Sem dados suficientes");

    await page.locator("#trendsMetric").selectOption("net");
    await expect(page.locator("#trendsMetric")).toHaveValue("net");
    await page.locator("#trendsMonths").selectOption("12");
    await expect(page.locator("#trendsMonths")).toHaveValue("12");
  });

  test("salva devoluções para a plataforma no mês selecionado", async ({ page }) => {
    await page.click('[data-nav="dashboard"]');
    await expect(page.locator("#dashboardScreen")).toBeVisible();

    await page.click('[data-dashboard-tab="entries"]');
    await page.click('[data-tab="returns"]');
    await page.locator("#ret_mercado-livre").fill("125.50");
    await page.click('.sidebar-item[data-dashboard-tab="overview"]');
    await page.click('.sidebar-item[data-dashboard-tab="entries"]');
    await expect(page.locator("#ret_mercado-livre")).toHaveValue("125.50");
    await page.click("#saveReturnsButton");

    await expect.poll(() => page.evaluate(() => {
      const month = window.dashboard.state.currentMonth;
      return window.dashboard.state.db[month]?.returns?.["mercado-livre"];
    })).toBe(125.5);
  });

  test("abre relatório com o resumo do período", async ({ page }) => {
    await page.click('[data-nav="dashboard"]');
    await expect(page.locator("#dashboardScreen")).toBeVisible();

    await page.click("#reportButton");
    await expect(page.locator("#reportModal")).toHaveClass(/open/);
    await expect(page.locator("#reportTitle")).toContainText("Relatório");
    await expect(page.locator("#reportContent .rkpi")).toHaveCount(4);
  });

  test("exporta um backup JSON", async ({ page }) => {
    await page.click('[data-nav="dashboard"]');
    await expect(page.locator("#dashboardScreen")).toBeVisible();
    await page.click("#sidebarBackupsButton");
    const downloadPromise = page.waitForEvent("download");
    await page.click("#sidebarExportBackupButton");
    const download = await downloadPromise;
    await expect(download.suggestedFilename()).toMatch(/dashboard-vendas-backup-.*\.json/);
    const payload = JSON.parse(await readFile(await download.path(), "utf8"));
    expect(payload.sessionUser).toBeUndefined();
    expect(payload.state.auth).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("serverSessionToken");
  });

  test("preserva a edição após falha de salvamento e recarregamento", async ({ page }) => {
    await page.click('[data-nav="dashboard"]');
    await page.evaluate(() => window.dashboard.saveNow());
    await page.route("**/api/state", async route => {
      if (["POST", "PATCH"].includes(route.request().method())) await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"offline"}' });
      else await route.continue();
    });
    await page.evaluate(() => {
      window.dashboard.state.goals[window.dashboard.state.currentMonth] = { target: 54321 };
      window.dashboard.saveState();
    });
    await page.waitForTimeout(400);
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.dashboard.state.goals[window.dashboard.state.currentMonth]?.target)).toBe(54321);
    await page.unroute("**/api/state");
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect.poll(() => page.evaluate(async () => {
      const { apiRequest } = await import("/scripts/core/api.js");
      const remote = await apiRequest("/api/state");
      return remote.state.goals[window.dashboard.state.currentMonth]?.target;
    })).toBe(54321);
  });

  test("recupera rascunho antigo já salvo sem mostrar conflito", async ({ page }) => {
    await page.evaluate(() => window.dashboard.saveNow());
    await page.evaluate(async () => {
      const { apiRequest, loadSession } = await import("/scripts/core/api.js");
      const remote = (await apiRequest("/api/state")).state;
      const draft = { state: { ...remote, activeTab: "entries" }, version: "versao-antiga", savedAt: Date.now() };
      localStorage.setItem(`dashboard-pending-v1:${loadSession().username}:sessao-antiga`, JSON.stringify(draft));
    });
    await page.reload();
    await expect(page.locator("#hubScreen")).toBeVisible();
    await expect(page.locator("#syncConflictModal")).not.toHaveClass(/open/);
    expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith("dashboard-pending-v1:")))).toBe(false);
    expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith("dashboard-recovery-v1:")))).toBe(true);
  });

  test("detecta conflito entre duas abas sem sobrescrever a meta", async ({ page, context }) => {
    await page.click('[data-nav="dashboard"]');
    await page.evaluate(() => window.dashboard.saveNow());
    const second = await context.newPage();
    await second.goto("/");
    await second.waitForFunction(() => window.dashboard && window.dashboard.state.platforms.length === 2);
    await page.evaluate(async () => {
      window.dashboard.state.goals[window.dashboard.state.currentMonth] = { target: 11111 };
      await window.dashboard.saveNow();
    });
    await second.evaluate(async () => {
      window.dashboard.state.goals[window.dashboard.state.currentMonth] = { target: 22222 };
      await window.dashboard.saveNow();
    });
    await expect(second.locator("#syncConflictModal")).toHaveClass(/open/);
    const remoteTarget = await page.evaluate(async () => {
      const { apiRequest } = await import("/scripts/core/api.js");
      const remote = await apiRequest("/api/state");
      return remote.state.goals[window.dashboard.state.currentMonth].target;
    });
    expect(remoteTarget).toBe(11111);
    await second.route("**/api/state", route => route.abort());
    await second.click("#syncLoadRemoteButton");
    await expect(second.locator("#syncConflictModal")).toHaveClass(/open/);
    expect(await second.evaluate(() => Object.keys(localStorage).some(key => key.startsWith("dashboard-pending-v1:")))).toBe(true);
    await second.unroute("**/api/state");
    await second.click("#syncLoadRemoteButton");
    await expect.poll(() => second.evaluate(() => window.dashboard.state.goals[window.dashboard.state.currentMonth].target)).toBe(11111);
    await second.close();
  });

  test("rejeita backup inválido sem alterar as vendas", async ({ page }) => {
    await page.click('[data-nav="dashboard"]');
    const before = await page.evaluate(() => JSON.stringify(window.dashboard.state.db));
    await page.click("#sidebarBackupsButton");
    await page.click("#sidebarImportBackupButton");
    await page.locator("#backupFileInputModal").setInputFiles({ name: "invalido.json", mimeType: "application/json", buffer: Buffer.from('{"state":{"platforms":[],"db":{}}}') });
    await expect(page.locator("#backupPreviewModal")).not.toHaveClass(/open/);
    expect(await page.evaluate(() => JSON.stringify(window.dashboard.state.db))).toBe(before);
  });

  for (const mode of ["merge", "replace"]) {
    test(`importa backup no modo ${mode} preservando a sessão`, async ({ page }) => {
      await page.click('[data-nav="dashboard"]');
      const username = await page.evaluate(() => window.dashboard.state.auth.username);
      await page.click("#sidebarBackupsButton");
      await page.click("#sidebarImportBackupButton");
      await page.locator(`[data-import-mode="${mode}"]`).click();
      await page.locator("#backupFileInputModal").setInputFiles({
        name: "backup.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ state: {
          platforms: [{ key: "importada", name: "Importada", icon: "IM", color: "#123456" }],
          currentMonth: "2026-Outubro",
          db: { "2026-Outubro": { days: [{ d: "03/10", importada: 450, orders_importada: 3 }], returns: { importada: 25 } } },
          goals: { "2026-Outubro": { target: 10000 } }
        } }))
      });
      await expect(page.locator("#backupPreviewModal")).toHaveClass(/open/);
      await page.click("#applyBackupImportButton");
      await expect.poll(() => page.evaluate(() => window.dashboard.state.db["2026-Outubro"]?.days.find(d => d.d === "03/10")?.importada)).toBe(450);
      const snapshot = await page.evaluate(() => ({
        username: window.dashboard.state.auth.username,
        keys: window.dashboard.state.platforms.map(p => p.key),
        goal: window.dashboard.state.goals["2026-Outubro"].target
      }));
      expect(snapshot.username).toBe(username);
      expect(snapshot.goal).toBe(10000);
      expect(snapshot.keys).toEqual(mode === "replace" ? ["importada"] : ["mercado-livre", "shopee", "importada"]);
    });
  }

  test("salva o perfil da conta e mantém o nome após recarregar", async ({ page }) => {
    await page.click('[data-nav="dashboard"]');
    await page.click("#dashboardUserMenuButton");
    await page.click("#openAccountSettingsButton");
    await expect(page.locator("#accountScreen")).toBeVisible();
    await page.locator("#accountDisplayNameInput").fill("Vendedora Teste");
    const saved = page.waitForResponse(r => r.url().endsWith("/api/auth/profile") && r.request().method() === "PATCH");
    await page.click("#accountSaveProfileButton");
    expect((await saved).status()).toBe(200);
    await page.reload();
    await expect(page.locator("#accountDisplayNameInput")).toHaveValue("Vendedora Teste");
  });

  test("navegar não grava o histórico e bibliotecas carregam conforme a necessidade", async ({ page }) => {
    expect(await page.evaluate(() => Boolean(window.Chart || window.html2canvas || window.XLSX))).toBe(false);
    await page.evaluate(() => window.dashboard.saveNow());
    const writes = [];
    page.on("request", request => { if (request.url().includes("/api/state") && ["POST", "PATCH"].includes(request.method())) writes.push(request); });
    await page.click('#hubScreen [data-dashboard-tab-target="entries"]');
    await expect(page.locator("#dashboard-panel-entries")).toBeVisible();
    await page.click('.sidebar-item[data-dashboard-tab="calculator"]');
    await expect(page.locator("#pricingProductCost")).toBeVisible();
    await page.click('.sidebar-item[data-dashboard-tab="overview"]');
    await expect.poll(() => page.evaluate(() => Boolean(window.Chart))).toBe(true);
    await page.waitForTimeout(650);
    expect(writes).toHaveLength(0);
    expect(await page.evaluate(() => Boolean(window.html2canvas))).toBe(false);
    await page.goBack();
    await expect(page.locator("#dashboard-panel-calculator")).toBeVisible();
  });

  test("confere valores brasileiros, adiciona, substitui e desfaz sem apagar campos vazios", async ({ page }) => {
    await page.click('#hubScreen [data-dashboard-tab-target="entries"]');
    await page.fill("#sale_mercado-livre", "1.234,56");
    await page.fill("#sale_shopee", "100,00");
    await expect(page.locator("#saleEntryPreview")).toContainText("1.234,56");
    await page.click("#registerSaleButton");
    const amount = () => page.evaluate(() => window.dashboard.state.db[window.dashboard.state.currentMonth].days[0]["mercado-livre"]);
    await expect.poll(amount).toBe(1234.56);
    await page.fill("#sale_mercado-livre", "100"); await page.click("#registerSaleButton");
    await expect.poll(amount).toBe(1334.56);
    await page.selectOption("#saleEntryMode", "replace");
    await page.fill("#sale_mercado-livre", "50,00"); await page.click("#registerSaleButton");
    await expect.poll(amount).toBe(50);
    expect(await page.evaluate(() => window.dashboard.state.db[window.dashboard.state.currentMonth].days[0].shopee)).toBe(100);
    await page.click("#undoSaleButton"); await expect.poll(amount).toBe(1334.56);
    await page.fill("#sale_mercado-livre", "12,34,56");
    await expect(page.locator("#saleEntryError")).toBeVisible();
    await page.click("#registerSaleButton"); await expect.poll(amount).toBe(1334.56);
    await page.fill("#sale_mercado-livre", "77,50");
    await page.click('.sidebar-item[data-dashboard-tab="calculator"]');
    await page.click('.sidebar-item[data-dashboard-tab="entries"]');
    await expect(page.locator("#sale_mercado-livre")).toHaveValue("77,50");
    await page.evaluate(() => window.dashboard.saveNow()); await page.reload();
    await expect(page.locator("#sale_mercado-livre")).toHaveValue("77,50");
    await expect.poll(amount).toBe(1334.56);
    await page.screenshot({ path: "test-results/entries-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/entries-mobile.png", fullPage: true });
  });

  test("modal mantém o foco e edição por teclado respeita Enter e Escape", async ({ page }) => {
    await page.click('#hubScreen [data-dashboard-tab-target="entries"]');
    await page.fill("#sale_mercado-livre", "100"); await page.click("#registerSaleButton");
    await page.click('.sidebar-item[data-dashboard-tab="daily"]');
    await page.click("#openDailyDetailsButton");
    const cell = page.locator('#dailyDetailsTable [data-platform-key="mercado-livre"]').first();
    await cell.fill("1.234,56"); await cell.press("Enter");
    await expect.poll(() => page.evaluate(() => window.dashboard.state.db[window.dashboard.state.currentMonth].days[0]["mercado-livre"])).toBe(1234.56);
    await cell.fill("999"); await cell.press("Escape");
    await expect(cell).toHaveValue("1234.56");
    await expect(page.locator("#dailyDetailsModal")).toHaveClass(/open/);
    const buttons = page.locator('#dailyDetailsModal button');
    await buttons.last().focus(); await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.getElementById("dailyDetailsModal").contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.locator("#dailyDetailsModal")).not.toHaveClass(/open/);
    await expect(page.locator("#openDailyDetailsButton")).toBeFocused();
  });

  test("importa CSV em segundo plano com prévia e valores corretos", async ({ page }) => {
    await page.click('#hubScreen [data-open-sales-import]');
    await expect(page.locator("#salesSheetImportModal")).toHaveClass(/open/);
    await page.locator("#salesSheetFileInput").setInputFiles({ name: "vendas.csv", mimeType: "text/csv", buffer: Buffer.from("Data;Mercado Livre vendas;Mercado Livre pedidos\n01/10/2026;1234,56;2\n02/10/2026;50,00;1", "utf8") });
    await expect(page.locator("#salesImportPreviewButton")).toBeVisible();
    await page.locator("#salesImportPeriod").selectOption("2026-Outubro");
    await page.click("#salesImportPreviewButton");
    await expect(page.locator("#salesSheetPreview")).toContainText("2 dias encontrados");
    expect(await page.evaluate(() => Boolean(window.XLSX))).toBe(false);
    await page.click("#salesSheetImportButton");
    await expect.poll(() => page.evaluate(() => window.dashboard.state.db["2026-Outubro"]?.days.find(day => day.d === "01/10")?.["mercado-livre"])).toBe(1234.56);
  });

  test("carrega outro mês sob demanda e mantém o backup completo", async ({ page }) => {
    await page.evaluate(async () => {
      const names = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      window.dashboard.state.db = Object.fromEntries(names.map((month, index) => [`2026-${month}`, { days: [{ d: `01/${String(index + 1).padStart(2, "0")}`, "mercado-livre": 100 + index, "orders_mercado-livre": 1 }], returns: {} }]));
      window.dashboard.state.currentMonth = "2026-Dezembro";
      window.dashboard.setActiveScreen("dashboard"); window.dashboard.renderScreen();
      await window.dashboard.saveNow();
    });
    await page.reload();
    expect(await page.evaluate(() => Object.keys(window.dashboard.state.db).length)).toBeLessThan(5);
    await page.selectOption("#dashboardPeriodSelect", "2026-Janeiro");
    await expect.poll(() => page.evaluate(() => window.dashboard.state.currentMonth)).toBe("2026-Janeiro");
    await expect(page.locator("#kpiRow .kpi-card--gross")).toContainText("100");
    await page.click("#sidebarBackupsButton");
    const download = page.waitForEvent("download"); await page.click("#sidebarExportBackupButton");
    const file = await download; const payload = JSON.parse(await readFile(await file.path(), "utf8"));
    expect(Object.keys(payload.state.db)).toHaveLength(12);
    expect(payload.state.db["2026-Dezembro"].days[0]["mercado-livre"]).toBe(111);
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

    await expect(page.locator("#dashboardPeriodSelect")).toHaveValue("2027-Janeiro");
    await page.evaluate(() => window.dashboard.saveNow());
    await page.reload();
    await expect(page.locator("#dashboardPeriodSelect")).toHaveValue("2027-Janeiro");
  });

  test("exportadores carregam ao exportar e o CSS de produção usa compressão e cache", async ({ page }) => {
    const stylesheet = await page.locator('link[rel="stylesheet"]').getAttribute("href");
    if (process.env.KANRI_E2E_PRODUCTION === "1") {
      expect(stylesheet).toMatch(/\/compiled\/app\.[a-f0-9]{12}\.css/);
      const response = await page.request.get(stylesheet, { headers: { "Accept-Encoding": "br" } });
      expect(response.headers()["content-encoding"]).toBe("br");
      expect(response.headers()["cache-control"]).toContain("immutable");
      expect(await response.text()).not.toContain("@import");
      const cached = await page.request.get(stylesheet, { headers: { "Accept-Encoding": "br", "If-None-Match": response.headers().etag } });
      expect(cached.status()).toBe(304);
    }
    await page.click('[data-nav="dashboard"]');
    await page.click("#reportButton");
    await expect(page.locator("#reportModal")).toHaveClass(/open/);
    expect(await page.evaluate(() => Boolean(window.html2canvas || window.XLSX))).toBe(false);
    const png = page.waitForEvent("download"); await page.click("#exportReportButton");
    expect((await png).suggestedFilename()).toMatch(/\.png$/);
    const xlsx = page.waitForEvent("download"); await page.click("#exportReportXlsxButton");
    const excel = await xlsx;
    expect(excel.suggestedFilename()).toMatch(/\.xlsx$/);
    const bytes = await readFile(await excel.path()); expect(bytes.subarray(0, 2).toString()).toBe("PK");
  });
});
