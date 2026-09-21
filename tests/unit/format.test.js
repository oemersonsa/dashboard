import { describe, it, expect } from "vitest";
import {
  R, RS, escapeHtml, slugify, hexToRgb, alphaColor, formatSavedAt
} from "../../public/scripts/core/format.js";

describe("format.js", () => {
  describe("R (formata moeda)", () => {
    it("formata zero", () => {
      expect(R(0)).toBe("R$ 0,00");
    });

    it("formata inteiro", () => {
      expect(R(1000)).toBe("R$ 1.000,00");
    });

    it("formata decimal", () => {
      expect(R(1234.56)).toBe("R$ 1.234,56");
    });

    it("trata null/undefined como zero", () => {
      expect(R(null)).toBe("R$ 0,00");
      expect(R(undefined)).toBe("R$ 0,00");
    });

    it("formata valores negativos", () => {
      expect(R(-50.5)).toBe("R$ -50,50");
    });
  });

  describe("RS (formata compacto)", () => {
    it("inteiro sem decimais", () => {
      expect(RS(1000)).toBe("R$ 1.000");
    });

    it("decimal com 2 casas", () => {
      expect(RS(1234.5)).toBe("R$ 1.234,50");
    });
  });

  describe("escapeHtml", () => {
    it("escapa caracteres perigosos", () => {
      expect(escapeHtml("<script>alert('xss')</script>"))
        .toBe("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
    });

    it("escapa aspas duplas", () => {
      expect(escapeHtml('a"b')).toBe("a&quot;b");
    });

    it("mantém texto normal", () => {
      expect(escapeHtml("Olá mundo")).toBe("Olá mundo");
    });
  });

  describe("slugify", () => {
    it("converte para minúsculas com hífens", () => {
      expect(slugify("Mercado Livre")).toBe("mercado-livre");
    });

    it("remove acentos", () => {
      expect(slugify("Magazine Luíza")).toBe("magazine-luiza");
    });

    it("remove caracteres especiais", () => {
      expect(slugify("A/B @ C#")).toBe("a-b-c");
    });

    it("remove hífens duplicados", () => {
      expect(slugify("a -- b")).toBe("a-b");
    });
  });

  describe("hexToRgb", () => {
    it("converte hex de 6 dígitos", () => {
      expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
    });

    it("converte hex de 3 dígitos", () => {
      expect(hexToRgb("#f00")).toEqual({ r: 255, g: 0, b: 0 });
    });

    it("retorna null para cor inválida", () => {
      expect(hexToRgb("not-a-color")).toBeNull();
    });
  });

  describe("alphaColor", () => {
    it("gera rgba corretamente", () => {
      expect(alphaColor("#ff0000", 0.5)).toBe("rgba(255,0,0,0.5)");
    });

    it("retorna cor original se inválida", () => {
      expect(alphaColor("invalid", 0.5)).toBe("invalid");
    });
  });

  describe("formatSavedAt", () => {
    it("retorna vazio para null", () => {
      expect(formatSavedAt(null)).toBe("");
    });

    it("formata ISO date", () => {
      const result = formatSavedAt("2026-09-19T14:30:00Z");
      expect(result).toMatch(/\d{2}\/\d{2}/);
    });
  });
});