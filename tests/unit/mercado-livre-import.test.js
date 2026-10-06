import { describe, expect, it } from "vitest";
import { groupMercadoLivreOrders, isMercadoLivreExport } from "../../public/scripts/features/sales/mercado-livre-import.calc.js";

const headers = ["N.º de venda", "Data de venda", "Estado", "Unidades", "Receita por produtos (BRL)", "Preço unitário de venda do anúncio (BRL)", "Cancelamentos e reembolsos (BRL)"];
const date = "30 de setembro de 2026 22:55 hs.";

describe("importação Mercado Livre", () => {
  it("reconhece as colunas específicas", () => {
    expect(isMercadoLivreExport(headers)).toBe(true);
    expect(isMercadoLivreExport(["Data", "Total"])).toBe(false);
  });

  it("usa receita por produtos ou preço vezes unidades, sem somar o resumo do pacote", () => {
    const result = groupMercadoLivreOrders(headers, [
      ["pacote", date, "Pacote de 2 produtos", "", 300, "", ""],
      ["a", date, "Entregue", 1, 100, 100, ""],
      ["b", date, "Entregue", 2, "", 100, ""]
    ]);
    expect(result.rows).toEqual([["2026-09-30", 300, 2, 0, 0]]);
    expect(result.skippedRows).toBe(1);
    expect(result.estimatedSales).toBe(1);
  });

  it("conta pedidos únicos e ignora linhas vazias de troca", () => {
    const result = groupMercadoLivreOrders(headers, [
      ["a", date, " ", "", "", "", ""],
      ["a", date, "Troca entregue", 1, "", 100, ""],
      ["a", date, "Entregue", 1, "", 50, ""]
    ]);
    expect(result.rows).toEqual([["2026-09-30", 150, 1, 0, 0]]);
  });

  it("importa os reembolsos informados em valor absoluto e não estima valores ausentes", () => {
    const result = groupMercadoLivreOrders(headers, [
      ["a", date, "Cancelada pelo comprador", 1, 100, 100, -80],
      ["b", date, "Devolução finalizada", 1, 100, 100, "-75,50"],
      ["c", date, "Devolução a caminho", 1, "", 100, ""],
      ["d", date, "Devolução finalizada", 1, "", 100, ""]
    ]);
    expect(result.rows).toEqual([["2026-09-30", 400, 4, 75.5, 80]]);
    expect(result.missingRefunds).toBe(2);
  });

  it("rejeita valores inválidos com a linha original", () => {
    expect(() => groupMercadoLivreOrders(headers, [["a", date, "Entregue", 1, "", "inválido", ""]], 8)).toThrow("Linha 8");
    expect(() => groupMercadoLivreOrders(headers, [["a", "31 de fevereiro de 2026", "Entregue", 1, 100, 100, ""]])).toThrow("Linha 8");
  });
});
