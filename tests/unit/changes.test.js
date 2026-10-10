import { describe, it, expect } from "vitest";
import { diffBusiness } from "../../public/scripts/core/changes.js";
const baseline = { platforms: [{ key: "ml", name: "ML" }], pricing: null, goals: {},
  db: { "2026-Outubro": { days: [{ d: "01/10", ml: 10, orders_ml: 1 }, { d: "02/10", ml: 20 }], returns: { ml: 0 } } } };
describe("edições incrementais", () => {
  it("navegar não produz alterações de negócio", () => {
    expect(diffBusiness(baseline, { ...baseline, currentMonth: "2026-Setembro", activeTab: "calculator" })).toEqual({});
  });
  it("envia somente o dia alterado, sem excluir meses ainda não carregados", () => {
    const edited = structuredClone(baseline); edited.db["2026-Outubro"].days[1].ml = 50;
    const delta = diffBusiness(baseline, edited);
    expect(delta).toEqual({ months: { "2026-Outubro": { days: [{ d: "02/10", ml: 50 }], deletedDays: [], returns: {} } } });
    expect(JSON.stringify(delta)).not.toContain("01/10");
  });
  it("explicita exclusões e valores zerados", () => {
    const edited = structuredClone(baseline); edited.db["2026-Outubro"].days.splice(0, 1);
    edited.db["2026-Outubro"].returns.ml = 10;
    expect(diffBusiness(baseline, edited).months["2026-Outubro"].deletedDays).toEqual(["01/10"]);
    expect(diffBusiness(edited, baseline).months["2026-Outubro"].returns.ml).toBe(0);
    expect(diffBusiness(baseline, { ...baseline, db: {} }).months).toEqual({ "2026-Outubro": null });
  });
  it("não depende da ordem das propriedades", () => {
    expect(diffBusiness(baseline, { ...baseline, platforms: [{ name: "ML", key: "ml" }] })).toEqual({});
  });
});
