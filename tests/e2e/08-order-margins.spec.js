import { test, expect } from "@playwright/test";
import { calculate } from "../../src/services/order-margin.calc";

test("analisa taxas, frete, custos e margem por pedido com persistência e filtros", async ({ page, request }) => {
  await page.setViewportSize({ width: 1586, height: 1000 });
  const username = `margin_${Date.now()}`;
  const registered = await request.post("/api/auth/register", { data: { username, password: "senha-segura-1234" } });
  const { sessionToken } = await registered.json();
  await request.post("/api/state", { headers: { Authorization: `Bearer ${sessionToken}` }, data: {
    state: { platforms: [{ key: "mercado-livre", name: "Mercado Livre", icon: "ML", color: "#ffff00" }], db: {}, goals: {}, currentMonth: "2026-Outubro", currentScreen: "dashboard", activeTab: "orders" }
  } });
  await page.addInitScript(({ username, sessionToken }) => {
    localStorage.setItem("dashboard-vendas-session-v1", JSON.stringify({ username, provider: "local", serverSessionToken: sessionToken, expiresAt: Date.now() + 86400000 }));
    localStorage.setItem("dashboard-vendas-auth-v2", JSON.stringify({ auth: { username, provider: "local" }, currentScreen: "dashboard" }));
  }, { username, sessionToken });
  const products = [{ sku: "SKU-A", productCost: 20, packagingCost: 1 }];
  const order = { id: "111", status: "paid", currency: "BRL", grossCents: 10000, saleFeeCents: 1500, refundsKnown: true, refundedCents: 0,
    dateCreated: "2026-10-03T12:00:00-03:00", items: [{ quantity: 2, title: "Produto <script>alert(1)</script>", sku: "SKU-A" }] };
  let financial = {};
  let costs = {};
  let version = "";
  const other = { ...order, id: "222", grossCents: 8000, saleFeeCents: 800, items: [{ quantity: 1, title: "Pedido com prejuízo", sku: "SKU-B" }] };
  const otherFinancial = { shipping: { costCents: 800 }, billing: { status: "available", saleFeeCents: 800, charges: [] } };
  const otherCosts = { productCostCents: 9000, packagingCents: 0, taxCents: 0, otherCents: 0, reviewed: true };
  const BASE = "/api/integrations/mercado-livre";
  const details = () => ({ order, financial, settings: costs, updatedAt: version, financialUpdatedAt: financial.billing ? "2026-10-17T12:00:00Z" : null, calculation: calculate(order, financial, costs, products) });
  await page.route(`**${BASE}/margins**`, async route => {
    const url = new URL(route.request().url()); let body;
    if (url.pathname.endsWith("/refresh")) {
      financial = { shipping: { costCents: 1000, allocated: false }, warnings: [], billing: { checkedAt: "2026-10-17T12:00:00Z", status: "available", saleFeeCents: 1200,
        charges: [{ id: "CHARGE:1", label: "Tarifa por venda", type: "CHARGE", subtype: "CV", currency: "BRL", amountCents: 1200, signedCents: 1200, selectable: false, covered: true },
          { id: "CHARGE:3", label: "Serviço adicional", type: "CHARGE", subtype: "SERVICE", currency: "BRL", amountCents: 300, signedCents: 300, selectable: true }] } };
      body = details();
    } else if (url.pathname.endsWith("/costs")) {
      const input = route.request().postDataJSON();
      expect(input.expectedUpdatedAt).toBe(version); costs = input.costs; version = "saved-version"; body = details();
    } else if (url.pathname.endsWith("/111")) body = details();
    else {
      let records = [details(), { order: other, calculation: calculate(other, otherFinancial, otherCosts) },
        { order: { ...order, id: "333", status: "cancelled" }, calculation: calculate({ ...order, status: "cancelled" }, financial, costs, products) }];
      if (url.searchParams.get("margin") === "loss") records = records.filter(row => row.calculation.ready && row.calculation.profitCents < 0);
      if (url.searchParams.get("margin") === "pending") records = records.filter(row => row.calculation.eligible && !row.calculation.ready);
      const ready = records.filter(row => row.calculation.ready);
      const sales = ready.reduce((sum, row) => sum + row.order.grossCents, 0);
      const profit = ready.reduce((sum, row) => sum + row.calculation.profitCents, 0);
      body = { records, total: records.length, nextOffset: null, summary: { calculated: ready.length,
        pending: records.filter(row => row.calculation.eligible && !row.calculation.ready).length, salesCents: sales, profitCents: profit,
        marginPercent: sales ? profit / sales * 100 : null, estimated: 0 } };
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/#/dashboard/orders?month=2026-Outubro");
  await expect(page.locator("#dashboardPageTitle")).toHaveText("Pedidos e margens");
  await expect(page.locator("#orderMarginRows > tr")).toHaveCount(3);
  await expect(page.locator("#orderMarginRows")).toContainText("Custos pendentes");
  await expect(page.locator("#orderMarginRows script")).toHaveCount(0);
  await page.getByRole("button", { name: "Analisar pedido 111", exact: true }).click();
  await expect(page.locator("#orderMarginResult")).toHaveText("Margem pendente");
  await page.locator("#orderMarginRefreshFinancials").click();
  await expect(page.locator("#orderMarginBreakdown")).toContainText("12,00");
  await expect(page.locator("#orderMarginBreakdown")).toContainText("10,00");
  await expect(page.getByRole("checkbox", { name: "Incluir Tarifa por venda como cobrança adicional" })).toBeDisabled();
  await page.locator("#orderCost-taxCents").fill("6,00");
  await page.locator("#orderCost-otherCents").fill("1,00");
  await page.getByRole("checkbox", { name: "Incluir Serviço adicional como cobrança adicional" }).check();
  await page.locator("#orderMarginReviewed").check();
  await page.getByRole("button", { name: "Salvar e calcular margem", exact: true }).click();
  await expect(page.locator("#orderMarginResult")).toContainText("26,00");
  await expect(page.locator("#orderMarginResult")).toContainText("26%");
  expect(costs.includedChargeIds).toEqual(["CHARGE:3"]);
  expect(costs.productCostCents).toBeNull();
  await page.locator("#orderCost-productCostCents").fill("200,00");
  await expect(page.locator("#orderMarginReviewed")).not.toBeChecked();
  await expect(page.locator("#orderMarginRefreshFinancials")).toBeDisabled();
  await page.locator("#orderMarginDiscard").click();
  await expect(page.locator("#orderCost-productCostCents")).toHaveValue("");
  await page.evaluate(() => document.querySelectorAll(".toast.show").forEach(item => item.classList.remove("show")));
  await page.locator("#dashboard-panel-orders").screenshot({ path: "output/design/order-margins-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator("#orderMarginDetail").screenshot({ path: "output/design/order-margins-mobile.png" });
  await page.locator("#orderMarginFilter").selectOption("loss");
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(page.locator("#orderMarginRows > tr")).toHaveCount(1);
  await expect(page.locator("#orderMarginRows")).toContainText("222");
  await page.reload();
  await expect(page.locator("#dashboardPageTitle")).toHaveText("Pedidos e margens");
  await page.getByRole("button", { name: "Analisar pedido 111", exact: true }).click();
  await expect(page.locator("#orderMarginResult")).toContainText("26%");
  await expect(page.locator("#orderCost-taxCents")).toHaveValue("6,00");
  expect(errors).toEqual([]);
});
