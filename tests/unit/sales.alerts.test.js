import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { state } from "../../public/scripts/core/state.js";
import { renderTrackingAlerts } from "../../public/scripts/features/sales/sales.ui.js";

describe("alerta de devoluções acima de 25%", () => {
  let banner;

  beforeEach(() => {
    banner = { innerHTML: "", hidden: true };
    vi.stubGlobal("document", { getElementById: () => banner });
    state.platforms = [{ key: "ml", name: "Mercado Livre" }, { key: "sh", name: "Shopee" }];
    state.currentMonth = "2026-Setembro";
    state.goals = {};
    state.db = {
      "2026-Setembro": {
        days: [{ d: "01/09", ml: 800, sh: 200 }],
        returns: { ml: 200, sh: 60 }
      }
    };
  });

  afterEach(() => vi.unstubAllGlobals());

  it("usa a soma de todas as plataformas mesmo sem mês anterior ou meta", () => {
    renderTrackingAlerts();
    expect(banner.hidden).toBe(false);
    expect(banner.innerHTML).toContain('role="alert"');
    expect(banner.innerHTML).toContain("26,0%");
    expect(banner.innerHTML).toContain("260,00");
    expect(banner.innerHTML).toContain("1.000,00");
  });

  it.each([0, 49, 50])("não alerta quando o total é de até 25%% (Shopee: %s)", (returns) => {
    state.db[state.currentMonth].returns.sh = returns;
    renderTrackingAlerts();
    expect(banner.innerHTML).not.toContain("return-threshold-alert");
    expect(banner.hidden).toBe(true);
  });

  it("retira o alerta quando as devoluções diminuem", () => {
    renderTrackingAlerts();
    state.db[state.currentMonth].returns.sh = 0;
    renderTrackingAlerts();
    expect(banner.hidden).toBe(true);
    expect(banner.innerHTML).toBe("");
  });

  it("alerta com devoluções e nenhuma venda, sem dividir por zero", () => {
    state.db[state.currentMonth].days = [];
    renderTrackingAlerts();
    expect(banner.innerHTML).toContain("sem vendas brutas registradas");
    expect(banner.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("atualiza o alerta ao mudar para um mês sem devoluções", () => {
    renderTrackingAlerts();
    state.currentMonth = "2026-Outubro";
    state.db[state.currentMonth] = { days: [], returns: {} };
    renderTrackingAlerts();
    expect(banner.innerHTML).not.toContain("return-threshold-alert");
  });
});
