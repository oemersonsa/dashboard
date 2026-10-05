import { describe, it, expect } from "vitest";
import { validateBackup } from "../../public/scripts/features/backup/backup.validation.js";
const valid = () => ({ version: 3, state: {
  platforms: [{ key: "ml", name: "Mercado Livre" }],
  db: { "2026-Outubro": { days: [{ d: "03/10", ml: 100, orders_ml: 2 }], returns: { ml: 10 } } },
  goals: { "2026-Outubro": { target: 500 } }
} });
describe("validação de backup", () => {
  it("aceita um backup e resume o conteúdo", () => expect(validateBackup(valid()).summary).toContain("1 período"));
  it.each([null, [], {}, { version: 99 }, { state: { platforms: [], db: {} } }])("rejeita estrutura inválida %j", value => expect(() => validateBackup(value)).toThrow());
  it("rejeita plataformas duplicadas", () => { const p = valid(); p.state.platforms.push(p.state.platforms[0]); expect(() => validateBackup(p)).toThrow(/duplicadas/); });
  it.each(["32/10", "01/09", "31/02"])("rejeita data %s", date => { const p = valid(); p.state.db["2026-Outubro"].days[0].d = date; expect(() => validateBackup(p)).toThrow(); });
  it.each([-1, "100", Infinity])("rejeita valor %s", amount => { const p = valid(); p.state.db["2026-Outubro"].days[0].ml = amount; expect(() => validateBackup(p)).toThrow(); });
  it("rejeita plataforma desconhecida", () => { const p = valid(); p.state.db["2026-Outubro"].days[0].unknown = 50; expect(() => validateBackup(p)).toThrow(); });
});
