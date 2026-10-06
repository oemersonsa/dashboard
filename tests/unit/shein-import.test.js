import { describe, expect, it } from "vitest";
import { groupSheinOrders, isSheinExport, parseSheinDate } from "../../public/scripts/features/sales/shein-import.calc.js";

const headers = ["Número do pedido", "SHEIN-SKU", "Data e hora de criação do pedido", "Preço do produto", "Número de artigos vendidos", "Status do pedido", "Status do produto"];

describe("importação de pedidos Shein", () => {
  it("reconhece o cabeçalho da exportação", () => {
    expect(isSheinExport(headers)).toBe(true);
    expect(isSheinExport(["Data", "Vendas Shopee"])).toBe(false);
  });

  it("lê datas por extenso e rejeita datas impossíveis", () => {
    expect(parseSheinDate("30 setembro 2026 21:56")).toEqual({ day: 30, month: 9, year: 2026 });
    expect(parseSheinDate("1 de março de 2026 12:00")).toEqual({ day: 1, month: 3, year: 2026 });
    expect(parseSheinDate("31 fevereiro 2026 12:00")).toBeNull();
  });

  it("soma itens, conta pedidos únicos e separa reembolsos e cancelamentos", () => {
    const rows = [
      ["A", "sku1", "30 setembro 2026 21:56", 100, 2, "Entregue", "Entregue"],
      ["A", "sku2", "30 setembro 2026 21:56", 50, 1, "Entregue", "Reembolsado por cliente"],
      ["B", "sku3", "30 setembro 2026 22:00", "R$ 49,90", 1, "Cancelado", ""],
      ["C", "sku4", "1 outubro 2026 10:00", 80, 1, "Enviado", "Enviado"]
    ];
    expect(groupSheinOrders(headers, rows)).toEqual([
      ["2026-09-30", 299.9, 2, 50, 49.9],
      ["2026-10-01", 80, 1, 0, 0]
    ]);
  });

  it("não aceita dados inválidos nem cabeçalhos incompletos", () => {
    expect(() => groupSheinOrders(headers, [["A", "sku", "data inválida", 100, 1, "Entregue"]])).toThrow("Linha 3");
    expect(() => groupSheinOrders(headers.slice(0, 4), [])).toThrow("colunas");
  });
});
