import { describe, it, expect, beforeEach } from "vitest";
import {
  getPricingBaseCost, calculatePlatformPrice, calculateSalePriceResult,
  getPsychologicalPriceOptions
} from "../../public/scripts/features/calculator/pricing.calc.js";
import { state } from "../../public/scripts/core/state.js";

function seedPricing() {
  state.pricing = {
    productCost: 50,
    packagingCost: 5,
    extraCost: 3,
    shippingSubsidy: 2,
    targetMargin: 20,
    targetProfit: 20,
    manualPrice: 0,
    mode: "margin",
    profiles: {}
  };
}

describe("pricing.calc.js", () => {
  beforeEach(seedPricing);

  describe("getPricingBaseCost", () => {
    it("soma todos os custos base", () => {
      expect(getPricingBaseCost()).toBe(60);
    });

    it("ignora valores nulos", () => {
      state.pricing.productCost = 0;
      state.pricing.packagingCost = 0;
      state.pricing.extraCost = 0;
      state.pricing.shippingSubsidy = 0;
      expect(getPricingBaseCost()).toBe(0);
    });
  });

  describe("calculatePlatformPrice (modo margem)", () => {
    it("calcula preço ideal sem taxas", () => {
      const r = calculatePlatformPrice({ commissionRate: 0, transactionRate: 0, fixedFee: 0, extraShippingCost: 0 });
      expect(r.idealPrice).toBeCloseTo(75, 2);
      expect(r.profit).toBeCloseTo(15, 2);
      expect(r.profitMargin).toBeCloseTo(20, 1);
    });

    it("aplica comissão", () => {
      const r = calculatePlatformPrice({ commissionRate: 10, transactionRate: 0, fixedFee: 0, extraShippingCost: 0 });
      expect(r.idealPrice).toBeCloseTo(85.71, 2);
      expect(r.commissionRate).toBe(10);
    });

    it("aplica taxa fixa", () => {
      const r = calculatePlatformPrice({ commissionRate: 0, transactionRate: 0, fixedFee: 10, extraShippingCost: 0 });
      expect(r.idealPrice).toBeCloseTo(87.5, 2);
      expect(r.fixedFee).toBe(10);
    });

    it("aplica frete repasse", () => {
      const r = calculatePlatformPrice({ commissionRate: 0, transactionRate: 0, fixedFee: 0, extraShippingCost: 15 });
      expect(r.idealPrice).toBeCloseTo(93.75, 2);
      expect(r.shippingCost).toBe(15);
    });

    it("soma tudo", () => {
      const r = calculatePlatformPrice({
        commissionRate: 10, transactionRate: 5, fixedFee: 6.5, extraShippingCost: 10
      });
      expect(r.idealPrice).toBeGreaterThan(100);
      expect(r.profitMargin).toBeCloseTo(20, 1);
    });

    it("retorna null se margem + taxas >= 100%", () => {
      state.pricing.targetMargin = 90;
      const r = calculatePlatformPrice({ commissionRate: 15, transactionRate: 0, fixedFee: 0, extraShippingCost: 0 });
      expect(r).toBeNull();
    });
  });

  describe("calculatePlatformPrice (modo lucro)", () => {
    it("calcula com lucro fixo desejado", () => {
      state.pricing.mode = "profit";
      state.pricing.targetProfit = 30;
      const r = calculatePlatformPrice({ commissionRate: 0, transactionRate: 0, fixedFee: 0, extraShippingCost: 0 });
      expect(r.idealPrice).toBeCloseTo(90, 2);
      expect(r.profit).toBeCloseTo(30, 2);
    });
  });

  describe("feeTiers (Shopee)", () => {
    it("escolhe faixa correta por preço", () => {
      const profile = {
        commissionRate: 20,
        transactionRate: 0,
        fixedFee: 4,
        extraShippingCost: 0,
        feeTiers: [
          { min: 0, max: 7.99, commissionRate: 50, fixedFee: 0 },
          { min: 8, max: 79.99, commissionRate: 20, fixedFee: 4 },
          { min: 80, max: null, commissionRate: 14, fixedFee: 16 }
        ]
      };
      const r = calculatePlatformPrice(profile);
      expect(r).not.toBeNull();
      expect(r.feeTier).toBeDefined();
    });
  });

  describe("calculateSalePriceResult", () => {
    it("calcula resultado para preço manual", () => {
      const r = calculateSalePriceResult(
        { commissionRate: 10, transactionRate: 0, fixedFee: 0, extraShippingCost: 0 },
        100
      );
      expect(r.idealPrice).toBe(100);
      expect(r.variableFees).toBeCloseTo(10, 2);
      expect(r.profit).toBeCloseTo(30, 2);
      expect(r.profitMargin).toBeCloseTo(30, 1);
    });

    it("detecta prejuízo", () => {
      const r = calculateSalePriceResult(
        { commissionRate: 10, transactionRate: 0, fixedFee: 0, extraShippingCost: 0 },
        50
      );
      expect(r.profit).toBeLessThan(0);
    });

    it("retorna null para preço zero", () => {
      expect(calculateSalePriceResult({}, 0)).toBeNull();
    });
  });

  describe("getPsychologicalPriceOptions", () => {
    it("retorna opções de arredondamento", () => {
      const opts = getPsychologicalPriceOptions(87.5);
      expect(opts.length).toBeGreaterThan(0);
      opts.forEach((p) => {
        expect(p).toBeGreaterThanOrEqual(87.5 * 0.96);
      });
    });

    it("retorna vazio para preço zero", () => {
      expect(getPsychologicalPriceOptions(0)).toEqual([]);
    });
  });
});