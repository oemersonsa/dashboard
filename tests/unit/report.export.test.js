import { describe, it, expect, beforeEach } from "vitest";
import {
  toCsvNumber,
  escapeCsvField,
  buildReportRows,
  toCsv
} from "../../public/scripts/features/reports/report.export.js";
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
        { d: "02/09", ml: 2000, sh: 300, orders_ml: 15, orders_sh: 3 }
      ],
      returns: { ml: 100, sh: 50 }
    },
    "2026-Agosto": {
      days: [
        { d: "01/08", ml: 800, sh: 400, orders_ml: 8, orders_sh: 4 }
      ],
      returns: { ml: 80, sh: 30 }
    }
  };
  state.currentMonth = "2026-Setembro";
}

describe("report.export.js", () => {
  beforeEach(seedState);

  describe("toCsvNumber", () => {
    it("converte decimal para vírgula", () => {
      expect(toCsvNumber(1000.5)).toBe("1000,50");
    });

    it("formata zero", () => {
      expect(toCsvNumber(0)).toBe("0,00");
    });

    it("trata null/undefined", () => {
      expect(toCsvNumber(null)).toBe("0,00");
      expect(toCsvNumber(undefined)).toBe("0,00");
    });

    it("trata NaN", () => {
      expect(toCsvNumber(NaN)).toBe("0,00");
    });
  });

  describe("escapeCsvField", () => {
    it("mantém texto sem caracteres especiais", () => {
      expect(escapeCsvField("Mercado Livre")).toBe("Mercado Livre");
    });

    it("envolve em aspas quando tem ;", () => {
      expect(escapeCsvField("a;b")).toBe('"a;b"');
    });

    it("dobra aspas internas", () => {
      expect(escapeCsvField('a"b')).toBe('"a""b"');
    });

    it("envolve em aspas quando tem quebra de linha", () => {
      expect(escapeCsvField("a\nb")).toBe('"a\nb"');
    });

    it("trata null/undefined como vazio", () => {
      expect(escapeCsvField(null)).toBe("");
      expect(escapeCsvField(undefined)).toBe("");
    });
  });

  describe("buildReportRows", () => {
    it("retorna summary com cabeçalho + linhas + total", () => {
      const r = buildReportRows("2026-Setembro", state);
      expect(r.summary[0][0]).toBe("Plataforma");
      expect(r.summary.length).toBe(4); // header + 2 plataformas + total
      expect(r.summary[r.summary.length - 1][0]).toBe("TOTAL");
    });

    it("summary tem os valores corretos para Mercado Livre", () => {
      const r = buildReportRows("2026-Setembro", state);
      const mlRow = r.summary.find((row) => row[0] === "Mercado Livre");
      expect(mlRow).toBeDefined();
      expect(mlRow[1]).toBe("3000,00"); // vendas
      expect(mlRow[2]).toBe("100,00");  // devoluções
    });

    it("retorna daily com cabeçalho dinâmico", () => {
      const r = buildReportRows("2026-Setembro", state);
      expect(r.daily[0][0]).toBe("Data");
      expect(r.daily[0]).toContain("Mercado Livre - Vendas");
      expect(r.daily[0]).toContain("Mercado Livre - Pedidos");
      expect(r.daily[0]).toContain("Total do dia");
    });

    it("daily tem uma linha por dia + header", () => {
      const r = buildReportRows("2026-Setembro", state);
      expect(r.daily.length).toBe(3); // header + 2 dias
    });

    it("meta traz rótulos legíveis", () => {
      const r = buildReportRows("2026-Setembro", state);
      expect(r.meta.monthLabel).toBe("Setembro 2026");
      expect(r.meta.previousLabel).toBe("Agosto 2026");
    });

    it("lida com mês sem dados (só header + total)", () => {
      const r = buildReportRows("2026-Julho", state);
      expect(r.summary.length).toBe(2); // header + total
      expect(r.summary[1][0]).toBe("TOTAL");
      expect(r.daily.length).toBe(1);   // só header
    });

    it("lida com mês sem anterior (variação vazia)", () => {
      const r = buildReportRows("2026-Agosto", state);
      const totalRow = r.summary[r.summary.length - 1];
      expect(totalRow[5]).toBe(""); // coluna "Vendas mês anterior"
      expect(totalRow[6]).toBe(""); // coluna "Variação %"
    });
  });

  describe("toCsv", () => {
    it("começa com BOM UTF-8", () => {
      const r = buildReportRows("2026-Setembro", state);
      const csv = toCsv(r);
      expect(csv.charCodeAt(0)).toBe(0xFEFF);
    });

    it("usa ; como separador", () => {
      const r = buildReportRows("2026-Setembro", state);
      const csv = toCsv(r);
      expect(csv).toContain("Plataforma;Vendas;Devoluções");
    });

    it("usa CRLF como quebra de linha", () => {
      const r = buildReportRows("2026-Setembro", state);
      const csv = toCsv(r);
      expect(csv).toContain("\r\n");
    });

    it("contém as seções RESUMO e DIÁRIO", () => {
      const r = buildReportRows("2026-Setembro", state);
      const csv = toCsv(r);
      expect(csv).toContain("RESUMO POR PLATAFORMA");
      expect(csv).toContain("VENDAS DIÁRIAS");
    });

    it("não quebra com aspas em nome de plataforma", () => {
      state.platforms[0].name = 'Loja "Test"';
      const r = buildReportRows("2026-Setembro", state);
      const csv = toCsv(r);
      expect(csv).toContain('"Loja ""Test"""');
    });
  });
});