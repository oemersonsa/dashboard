import { describe, it, expect } from "vitest";
import {
  parsePeriodKey, normalizePeriodKey, getPeriodMonth, getPeriodYear,
  getPeriodLabel, sortPeriodKeys, normalizeMonthName
} from "../../public/scripts/core/state.js";

describe("state.js - Períodos", () => {
  describe("parsePeriodKey", () => {
    it("parseia formato ANO-Mês", () => {
      const r = parsePeriodKey("2026-Setembro");
      expect(r.year).toBe(2026);
      expect(r.month).toBe("Setembro");
    });

    it("parseia formato Mês-ANO", () => {
      const r = parsePeriodKey("Setembro-2026");
      expect(r.year).toBe(2026);
      expect(r.month).toBe("Setembro");
    });

    it("usa fallback para valor vazio", () => {
      const r = parsePeriodKey("");
      expect(r.year).toBeGreaterThanOrEqual(2020);
      expect(r.month).toBeTruthy();
    });
  });

  describe("normalizePeriodKey", () => {
    it("normaliza formato inconsistente", () => {
      expect(normalizePeriodKey("2026-setembro")).toBe("2026-Setembro");
    });
  });

  describe("getPeriodMonth / getPeriodYear", () => {
    it("extrai mês e ano", () => {
      expect(getPeriodMonth("2026-Setembro")).toBe("Setembro");
      expect(getPeriodYear("2026-Setembro")).toBe(2026);
    });
  });

  describe("getPeriodLabel", () => {
    it("gera label legível", () => {
      expect(getPeriodLabel("2026-Setembro")).toBe("Setembro 2026");
    });
  });

  describe("sortPeriodKeys", () => {
    it("ordena por ano e depois por mês", () => {
      const sorted = sortPeriodKeys([
        "2026-Marco", "2025-Dezembro", "2026-Janeiro", "2025-Janeiro"
      ]);
      expect(sorted).toEqual([
        "2025-Janeiro", "2025-Dezembro", "2026-Janeiro", "2026-Marco"
      ]);
    });
  });

  describe("normalizeMonthName", () => {
    it("aceita variações de acentuação", () => {
      expect(normalizeMonthName("Setembro")).toBe("Setembro");
      expect(normalizeMonthName("março")).toBe("Marco");
      expect(normalizeMonthName("FEVEREIRO")).toBe("Fevereiro");
    });
  });
});