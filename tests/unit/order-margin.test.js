import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const { calculate } = createRequire(import.meta.url)("../../src/services/order-margin.calc");
const order = { grossCents: 10000, status: "paid", currency: "BRL", saleFeeCents: 1500, refundsKnown: true, refundedCents: 0,
  items: [{ sku: "SKU-A", quantity: 2 }] };
const financial = { shipping: { costCents: 1000 }, billing: { status: "available", saleFeeCents: 1500, charges: [] } };
const settings = { productCostCents: 4000, packagingCents: 200, taxCents: 600, otherCents: 100, reviewed: true };

describe("Margem por pedido", () => {
  it("calcula resultado e margem sobre a venda, em centavos", () => {
    expect(calculate(order, financial, settings)).toMatchObject({ ready: true, profitCents: 2600, marginPercent: 26, estimated: false });
  });
  it("usa a tarifa líquida do faturamento em vez de somá-la à tarifa operacional", () => {
    expect(calculate(order, { ...financial, billing: { ...financial.billing, saleFeeCents: 1200 } }, settings).profitCents).toBe(2900);
    expect(calculate(order, financial, { ...settings, feeOverrideCents: 500 }).profitCents).toBe(3600);
  });
  it("não transforma custos desconhecidos em zero nem libera cálculo sem conferência", () => {
    const result = calculate(order, {}, {});
    expect(result.ready).toBe(false);
    expect(result.profitCents).toBeNull();
    expect(result.missing).toEqual(expect.arrayContaining(["shippingCents", "productCostCents", "taxCents", "review"]));
    expect(calculate(order, financial, { ...settings, reviewed: false }).ready).toBe(false);
  });
  it("multiplica custo e embalagem do SKU por unidades e rejeita SKU ambíguo", () => {
    const products = [{ sku: " sku-a ", productCost: 20, packagingCost: 1 }];
    const result = calculate(order, financial, { taxCents: 600, otherCents: 100, reviewed: true }, products);
    expect(result.costs).toMatchObject({ productCostCents: 4000, packagingCents: 200 });
    expect(result.sources.product).toBe("sku");
    expect(calculate(order, financial, {}, [...products, ...products]).costs.productCostCents).toBeNull();
  });
  it("exige confirmar a parte de produtos em reembolsos que podem incluir frete", () => {
    const refunded = { ...order, refundedCents: 1500 };
    expect(calculate(refunded, financial, settings).profitCents).toBeNull();
    expect(calculate(refunded, financial, { ...settings, productRefundCents: 1000 }).profitCents).toBe(1600);
  });
  it("desconta extras selecionados e soma créditos sem repetir linhas cobertas", () => {
    const f = { ...financial, billing: { ...financial.billing, charges: [
      { id: "charge", selectable: true, signedCents: 300 }, { id: "credit", selectable: true, signedCents: -100 }, { id: "fee", selectable: false, signedCents: 1500 }
    ] } };
    expect(calculate(order, f, { ...settings, includedChargeIds: ["charge", "credit"] }).profitCents).toBe(2400);
    expect(calculate(order, f, { ...settings, includedChargeIds: ["fee"] }).ready).toBe(false);
  });
  it("marca rateios e faturamento indisponível como estimativas", () => {
    expect(calculate(order, { ...financial, shipping: { costCents: 1000, allocated: true } }, settings).estimated).toBe(true);
    expect(calculate(order, { shipping: { costCents: 1000 } }, settings).estimated).toBe(true);
  });
  it("mantém resultado negativo e exclui cancelados ou outras moedas", () => {
    expect(calculate(order, financial, { ...settings, productCostCents: 10000 }).profitCents).toBe(-3400);
    expect(calculate({ ...order, status: "cancelled" }, financial, settings).ready).toBe(false);
    expect(calculate({ ...order, currency: "USD" }, financial, settings).ready).toBe(false);
  });
});
