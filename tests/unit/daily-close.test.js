import { describe, it, expect } from "vitest";
import {
  parseDailyCloseValues, buildDailyCloseReport
} from "../../public/scripts/features/daily-close/daily-close.calc.js";

describe("daily-close.calc.js", () => {
  describe("parseDailyCloseValues", () => {
    it("retorna 0 para vazio", () => {
      expect(parseDailyCloseValues("")).toBe(0);
      expect(parseDailyCloseValues(null)).toBe(0);
      expect(parseDailyCloseValues("   ")).toBe(0);
    });

    it("parseia valor simples com vírgula", () => {
      expect(parseDailyCloseValues("1000,50")).toBe(1000.5);
    });

    it("parseia valor com ponto decimal", () => {
      expect(parseDailyCloseValues("1000.50")).toBe(1000.5);
    });

    it("soma valores com +", () => {
      expect(parseDailyCloseValues("100 + 200")).toBe(300);
    });

    it("soma múltiplos valores", () => {
      expect(parseDailyCloseValues("100 + 200 + 50,50")).toBe(350.5);
    });

    it("aceita separadores variados", () => {
      expect(parseDailyCloseValues("1.000,50 + 500")).toBe(1500.5);
    });

    it("aceita ponto e vírgula", () => {
      expect(parseDailyCloseValues("100;200;300")).toBe(600);
    });

    it("aceita quebra de linha", () => {
      expect(parseDailyCloseValues("100\n200\n300")).toBe(600);
    });

    it("ignora texto", () => {
      expect(parseDailyCloseValues("R$ 100 reais")).toBe(100);
    });
  });

  describe("buildDailyCloseReport", () => {
    it("gera relatório com plataformas", () => {
      const report = buildDailyCloseReport([
        { platform: { name: "Mercado Livre" }, sales: 1000, returns: 100 },
        { platform: { name: "Shopee" }, sales: 500, returns: 50 }
      ]);
      expect(report).toContain("*Total Mercado Livre*");
      expect(report).toContain("*Total Shopee*");
      expect(report).toContain("*TOTAL:*");
    });

    it("ignora plataformas sem vendas", () => {
      const report = buildDailyCloseReport([
        { platform: { name: "Mercado Livre" }, sales: 1000, returns: 100 },
        { platform: { name: "Shopee" }, sales: 0, returns: 0 }
      ]);
      expect(report).toContain("Mercado Livre");
      expect(report).not.toContain("Shopee");
    });

    it("gera apenas total quando vazio", () => {
      const report = buildDailyCloseReport([]);
      expect(report).toBe("*TOTAL:*\n*_Vendas_*: *R$ 0,00*\n*_Devoluções_*: *R$ 0,00*\n*_Total_*: *R$ 0,00*");
    });
  });
});