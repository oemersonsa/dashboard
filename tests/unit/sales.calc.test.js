import { describe, it, expect, beforeEach } from "vitest";
import {
  calcTotals, getComparisonPeriod, getWeekBuckets,
  getMonthDays, getLoggedDays, getLastLoggedDay
} from "../../public/scripts/features/sales/sales.calc.js";
import { state } from "../../public/scripts/core/state.js";

function seedState() {
  state.platforms = [
    { key: "ml", name: "Mercado Livre", icon: "ML", color: "#ffe500", iconText: "#000" },
    { key: "sh", name: "Shopee", icon: "SH", color: "#ff5722", iconText: "#fff" }
  ];
  state.db = {
    "2026-Setembro": {
      days: [
        { d: "01/09", ml: 1000, sh: 500, orders_ml: 10, orders_sh: 5 },
        { d: "02/09", ml: 2000, sh: 300, orders_ml: 15, orders_sh: 3 },
        { d: "03/09", ml: 500, sh: 0, orders_ml: 4, orders_sh: 0 }
      ],
      returns: { ml: 100, sh: 50 }
    },
    "2026-Agosto": {
      days: [
        { d: "01/08", ml: 800, sh: 400, orders_ml: 8, orders_sh: 4 },
        { d: "02/08", ml: 1200, sh: 600, orders_ml: 10, orders_sh: 6 }
      ],
      returns: { ml: 80, sh: 30 }
    }
  };
  state.currentMonth = "2026-Setembro";
}

describe("sales.calc.js", () => {
  beforeEach(seedState);

  describe("getMonthDays", () => {
    it("retorna 30 para setembro", () => {
      expect(getMonthDays("2026-Setembro")).toBe(30);
    });

    it("retorna 31 para agosto", () => {
      expect(getMonthDays("2026-Agosto")).toBe(31);
    });

    it("retorna 28 para fevereiro não bissexto", () => {
      expect(getMonthDays("2025-Fevereiro")).toBe(28);
    });

    it("retorna 29 para fevereiro bissexto", () => {
      expect(getMonthDays("2024-Fevereiro")).toBe(29);
    });
  });

  describe("getLoggedDays", () => {
    it("conta dias com pelo menos uma venda", () => {
      expect(getLoggedDays("2026-Setembro")).toBe(3);
    });

    it("retorna 0 para mês vazio", () => {
      expect(getLoggedDays("2026-Julho")).toBe(0);
    });
  });

  describe("getLastLoggedDay", () => {
    it("retorna último dia lançado", () => {
      expect(getLastLoggedDay("2026-Setembro")).toBe(3);
    });
  });

  describe("calcTotals", () => {
    it("calcula vendas por plataforma", () => {
      const t = calcTotals("2026-Setembro");
      expect(t.sales.ml).toBe(3500);
      expect(t.sales.sh).toBe(800);
    });

    it("calcula pedidos por plataforma", () => {
      const t = calcTotals("2026-Setembro");
      expect(t.ordersByPlatform.ml).toBe(29);
      expect(t.ordersByPlatform.sh).toBe(8);
      expect(t.orders).toBe(37);
    });

    it("calcula gross, returns e net", () => {
      const t = calcTotals("2026-Setembro");
      expect(t.gross).toBe(4300);
      expect(t.totalRet).toBe(150);
      expect(t.net).toBe(4150);
    });

    it("respeita cutoffDay", () => {
      const t = calcTotals("2026-Setembro", { cutoffDay: 2 });
      expect(t.sales.ml).toBe(3000);
      expect(t.sales.sh).toBe(800);
      expect(t.gross).toBe(3800);
    });

    it("retorna null para mês inexistente", () => {
      expect(calcTotals("2026-Julho")).toBeNull();
    });
  });

  describe("getComparisonPeriod", () => {
    it("encontra mês anterior", () => {
      const c = getComparisonPeriod("2026-Setembro");
      expect(c.previousName).toBe("2026-Agosto");
      expect(c.previousTotals).not.toBeNull();
    });

    it("aplica cutoff no mês anterior", () => {
      const c = getComparisonPeriod("2026-Setembro");
      expect(c.cutoffDay).toBe(3);
      expect(c.previousTotals.sales.ml).toBe(2000);
    });

    it("primeiro mês não tem anterior", () => {
      const c = getComparisonPeriod("2026-Agosto");
      expect(c.previousName).toBeNull();
      expect(c.previousTotals).toBeNull();
    });
  });

  describe("getWeekBuckets", () => {
    it("divide o mês em semanas", () => {
      const buckets = getWeekBuckets("2026-Setembro", state.db["2026-Setembro"].days);
      expect(buckets.length).toBeGreaterThan(0);
      expect(buckets[0]).toHaveProperty("total");
      expect(buckets[0]).toHaveProperty("platforms");
      expect(buckets[0]).toHaveProperty("label");
    });

    it("soma corretamente por semana", () => {
      const buckets = getWeekBuckets("2026-Setembro", state.db["2026-Setembro"].days);
      const soma = buckets.reduce((s, b) => s + b.total, 0);
      expect(soma).toBe(4300);
    });
  });
});