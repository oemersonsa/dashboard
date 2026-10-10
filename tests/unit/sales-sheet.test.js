import { it, expect } from "vitest";
import { findTable, parseDate } from "../../public/scripts/features/sales/sales-sheet.calc.js";
it("encontra cabeçalho depois de linhas de identificação e permite escolher outra aba", () => {
  const matrices = { Info: [["Relatório"], ["Data", "Vendas"], ["01/10/2026", "1.234,56"]], Outra: [["Data", "Vendas"], ["02/10/2026", "50"]] };
  const result = findTable(matrices, []);
  expect(result.name).toBe("Info"); expect(result.headerIndex).toBe(1);
  expect(findTable(matrices, [], "", "Outra").name).toBe("Outra");
  expect(() => findTable({ Vazia: [[]] }, [])).toThrow("Não encontrei");
});
it("interpreta as datas suportadas e rejeita datas impossíveis", () => {
  expect(parseDate("2026-10-01")).toEqual({ day: 1, month: 10, year: 2026 });
  expect(parseDate("01/10/2026")).toEqual({ day: 1, month: 10, year: 2026 });
  expect(parseDate("01/10")).toEqual({ day: 1, month: 10, year: null });
  expect(parseDate("1 de outubro de 2026")).toEqual({ day: 1, month: 10, year: 2026 });
  expect(parseDate(new Date(2026, 9, 1))).toEqual({ day: 1, month: 10, year: 2026 });
  expect(parseDate("2026-02-30")).toBeNull(); expect(parseDate("30/02/2026")).toBeNull(); expect(parseDate("texto")).toBeNull();
});
it("consolida exportação reconhecida e exige plataforma ativa", () => {
  const matrix = [["Data da criação", "Número do pedido", "Preço do produto", "Quantidade", "Status do pedido"], ["01/10/2026", "P1", "10", "2", "Concluído"]];
  // Reconhecimento depende do cabeçalho real utilizado pelo importador.
  const platforms = [{ key: "ml", name: "Mercado Livre" }];
  const ml = { Vendas: [["Data de venda", "Receita por produtos (BRL)", "Preço unitário de venda do anúncio (BRL)", "Unidades", "N.º de venda", "Estado", "Cancelamentos e reembolsos (BRL)"], ["1 de outubro de 2026 10:00 hs.", "20", "10", "2", "P1", "Entregue", ""]] };
  const result = findTable(ml, platforms);
  expect(result.marketplace).toBe("mercado livre"); expect(result.platformKey).toBe("ml");
  expect(result.matrix.length).toBeGreaterThan(1);
  expect(() => findTable(ml, [])).toThrow("Cadastre");
  expect(findTable({ Normal: matrix }, []).headers.length).toBe(5);
});
