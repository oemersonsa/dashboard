import { describe, it, expect, beforeEach } from "vitest";
import { state } from "../../public/scripts/core/state.js";
import { previousCalendarMonth, variation, comparisonValues, comparisonWindow } from "../../public/scripts/features/comparison/comparison.calc.js";

describe("comparativo mensal", () => {
  beforeEach(() => {
    state.platforms = [{ key: "ml" }, { key: "sh", archived: true }];
    state.db = { "2026-Setembro": {
      days: [{ d: "01/09", ml: 1000, sh: 400, orders_ml: 10, orders_sh: 5, refunds_ml: 30 },
        { d: "30/09", ml: 200, orders_ml: 2, refunds_ml: 20 }],
      returns: { ml: 100, sh: 40 }
    } };
  });
  it("usa o mês anterior do calendário, incluindo a troca de ano", () => {
    expect(previousCalendarMonth("2026-Janeiro")).toBe("2025-Dezembro");
    expect(previousCalendarMonth("2026-Setembro")).toBe("2026-Agosto");
  });
  it("calcula aumentos, quedas e bases zero sem infinito", () => {
    expect(variation(128450, 110000)).toBeCloseTo(16.7727);
    expect(variation(3250, 4000)).toBe(-18.75);
    expect(variation(0, 50)).toBe(-100);
    expect(variation(0, 0)).toBe(0);
    expect(variation(50, 0)).toBeNull();
    expect(variation(50, null)).toBeNull();
  });
  it("inclui todos os dias, devoluções mensais e diárias e plataformas arquivadas", () => {
    expect(comparisonValues("2026-Setembro")).toEqual({ sales: 1600, returns: 190, orders: 17 });
    expect(comparisonValues("2026-Setembro", "ml")).toEqual({ sales: 1200, returns: 150, orders: 12 });
    expect(comparisonValues("2026-Setembro", "sh")).toEqual({ sales: 400, returns: 40, orders: 5 });
  });
  it("distingue mês ausente de mês registrado sem movimento", () => {
    expect(comparisonValues("2026-Agosto")).toBeNull();
    state.db["2026-Agosto"] = { days: [], returns: {} };
    expect(comparisonValues("2026-Agosto")).toEqual({ sales: 0, returns: 0, orders: 0 });
  });
  it("limita o mês em andamento ao último dia lançado, inclusive lançamentos zerados", () => {
    state.db["2026-Outubro"] = { days: [{ d: "01/10", ml: 100 }, { d: "10/10", ml: 0 }], returns: {} };
    expect(comparisonWindow("2026-Outubro", "2026-Setembro", new Date(2026, 9, 19))).toEqual({ partial: true, currentCutoff: 10, previousCutoff: 10 });
  });
  it("compara meses encerrados por inteiro mesmo com poucos dias lançados", () => {
    state.db["2026-Setembro"].days = [{ d: "01/09", ml: 100 }];
    expect(comparisonWindow("2026-Setembro", "2026-Agosto", new Date(2026, 9, 19))).toEqual({ partial: false, currentCutoff: null, previousCutoff: null });
    expect(comparisonWindow("2025-Dezembro", "2025-Novembro", new Date(2026, 0, 1)).partial).toBe(false);
  });
  it("corta vendas, pedidos e devoluções diárias e estima as mensais no intervalo", () => {
    const totals = comparisonValues("2026-Setembro", "ml", 10);
    expect(totals.sales).toBe(1000);
    expect(totals.orders).toBe(10);
    expect(totals.returns).toBeCloseTo(30 + 100 * 1000 / 1200);
    expect(comparisonValues("2026-Setembro", "sh", 10)).toEqual({ sales: 400, orders: 5, returns: 40 });
    expect(comparisonValues("2026-Setembro", "", 10).sales).toBe(1400);
  });
  it("limita o corte ao tamanho do mês comparado, inclusive fevereiro bissexto", () => {
    state.db["2026-Março"] = { days: [{ d: "31/03", orders_ml: 1 }], returns: {} };
    expect(comparisonWindow("2026-Março", "2026-Fevereiro", new Date(2026, 2, 31)).previousCutoff).toBe(28);
    expect(comparisonWindow("2026-Março", "2024-Fevereiro", new Date(2026, 2, 31)).previousCutoff).toBe(29);
  });
  it("não usa o mês anterior inteiro quando não há dia lançado", () => {
    const window = comparisonWindow("2026-Outubro", "2026-Setembro", new Date(2026, 9, 19));
    expect(window.currentCutoff).toBe(0);
    expect(comparisonValues("2026-Setembro", "", window.previousCutoff)).toBeNull();
  });
});
