import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { validateBusiness } = require("../../src/services/business.validation.js");

function snapshot(period = "2026-Marco", date = "01/03") {
  return {
    platforms: [{ key: "ml", name: "Mercado Livre" }],
    db: { [period]: { days: [{ d: date, ml: 100, orders_ml: 1 }], returns: { ml: 10 } } },
    goals: { [period]: { target: 80000 } },
    currentMonth: period
  };
}

describe("validação do histórico de março", () => {
  it.each(["2025-Marco", "2026-Marco", "2026-Março"])("aceita %s nas vendas, metas e período atual", period => {
    const state = snapshot(period);
    const original = JSON.stringify(state);
    expect(() => validateBusiness(state)).not.toThrow();
    expect(JSON.stringify(state)).toBe(original);
  });

  it("aceita meses de março antigos junto a setembro selecionado", () => {
    const state = snapshot();
    state.db["2025-Marco"] = { days: [{ d: "31/03", ml: 200, orders_ml: 2 }], returns: {} };
    state.currentMonth = "2026-Setembro";
    expect(() => validateBusiness(state)).not.toThrow();
  });

  it.each(["2026-MesInexistente", "1999-Marco", "2101-Marco"])("continua rejeitando o período inválido %s", period => {
    expect(() => validateBusiness(snapshot(period))).toThrow("invalid_business_data");
  });

  it("continua rejeitando datas de outro mês e valores negativos", () => {
    expect(() => validateBusiness(snapshot("2026-Marco", "01/04"))).toThrow("invalid_business_data");
    const state = snapshot();
    state.db["2026-Marco"].returns.ml = -10;
    expect(() => validateBusiness(state)).toThrow("invalid_business_data");
  });
});
