import { describe, it, expect, beforeEach } from "vitest";
import {
  getTrendSeries,
  getRecentPeriods,
  computeVariation,
  formatMetricValue
} from "../../public/scripts/features/trends/trends.calc.js";
import { state } from "../../public/scripts/core/state.js";

function seed() {
  state.platforms = [
    { key: "ml", name: "Mercado Livre", icon: "ML", color: "#ffe500", iconText: "#000" },
    { key: "sh", name: "Shopee", icon: "SH", color: "#ff5722", iconText: "#fff" }
  ];
  state.db = {
    "2026-Janeiro": {
      days: [
        { d: "01/01", ml: 1000, sh: 500, orders_ml: 10, orders_sh: 5 }
      ],
      returns: { ml: 50, sh: 20 }
    },
    "2026-Fevereiro": {
      days: [
        { d: "01/02", ml: 2000, sh: 0, orders_ml: 15, orders_sh: 0 }
      ],
      returns: { ml: 100, sh: 0 }
    },
    "2026-Marco": {
      days: [
        { d: "01/03", ml: 3000, sh: 1000, orders_ml: 20, orders_sh: 8 }
      ],
      returns: { ml: 150, sh: 50 }
    },
    "2026-Setembro": {
      days: [
        { d: "01/09", ml: 4000, sh: 2000, orders_ml: 25, orders_sh: 12 }
      ],
      returns: { ml: 200, sh: 100 }
    }
  };
  state.goals = {
    "2026-Marco": { target: 5000 },
    "2026-Setembro": { target: 8000 }
  };
  state.currentMonth = "2026-Setembro";
}

describe("trends.calc.js", () => {
  beforeEach(seed);

  describe("getRecentPeriods", () => {
    it("retorna os últimos N períodos existentes", () => {
      const p = getRecentPeriods(state, 6);
      expect(p.length).toBe(4);
      expect(p[0]).toBe("2026-Janeiro");
      expect(p[3]).toBe("2026-Setembro");
    });

    it("limita corretamente ao N", () => {
      const p = getRecentPeriods(state, 2);
      expect(p).toEqual(["2026-Marco", "2026-Setembro"]);
    });

    it("retorna tudo se N for maior que o total", () => {
      const p = getRecentPeriods(state, 12);
      expect(p.length).toBe(4);
    });
  });

  describe("computeVariation", () => {
    it("retorna null se não há base", () => {
      expect(computeVariation(100, 0)).toBeNull();
      expect(computeVariation(100, null)).toBeNull();
    });

    it("retorna null se current é null", () => {
      expect(computeVariation(null, 100)).toBeNull();
    });

    it("calcula variação positiva", () => {
      expect(computeVariation(150, 100)).toBe(50);
    });

    it("calcula variação negativa", () => {
      expect(computeVariation(80, 100)).toBe(-20);
    });
  });

  describe("formatMetricValue", () => {
    it("formata valor nulo como travessão", () => {
      expect(formatMetricValue(null, "gross")).toBe("—");
    });

    it("formata pedidos como inteiro", () => {
      expect(formatMetricValue(10.7, "orders")).toBe("11");
    });

    it("formata moeda pt-BR", () => {
      expect(formatMetricValue(1234.5, "gross")).toContain("1.234,50");
    });
  });

  describe("getTrendSeries", () => {
    it("retorna todos os períodos", () => {
      const s = getTrendSeries(state, { months: 6, metric: "gross" });
      expect(s.periods.length).toBe(4);
      expect(s.labels.length).toBe(4);
    });

    it("marca o mês atual como parcial", () => {
      const s = getTrendSeries(state, { months: 6, metric: "gross" });
      expect(s.isPartial[3]).toBe(true);
      expect(s.isPartial[0]).toBe(false);
    });

    it("só inclui plataformas ativas", () => {
      state.platforms.push({ key: "unused", name: "Sem uso", icon: "X", color: "#000" });
      const s = getTrendSeries(state, { months: 6, metric: "gross" });
      expect(s.platforms.find((p) => p.key === "unused")).toBeUndefined();
    });

    it("métrica gross retorna valores corretos para Total", () => {
      const s = getTrendSeries(state, { months: 6, metric: "gross" });
      // Jan: 1500, Fev: 2000, Mar: 4000, Set: 6000
      expect(s.total.data).toEqual([1500, 2000, 4000, 6000]);
    });

    it("métrica net subtrai devoluções", () => {
      const s = getTrendSeries(state, { months: 6, metric: "net" });
      // Jan: 1500 - 70 = 1430
      expect(s.total.data[0]).toBe(1430);
    });

    it("métrica orders soma pedidos", () => {
      const s = getTrendSeries(state, { months: 6, metric: "orders" });
      expect(s.total.data[0]).toBe(15);
    });

    it("métrica ticket calcula gross / orders", () => {
      const s = getTrendSeries(state, { months: 6, metric: "ticket" });
      // Jan: 1500 / 15 = 100
      expect(s.total.data[0]).toBe(100);
    });

    it("inclui série de meta apenas em metric net", () => {
      const s1 = getTrendSeries(state, { months: 6, metric: "net" });
      expect(s1.total.goal).not.toBeNull();
      expect(s1.total.goal.data).toEqual([null, null, 5000, 8000]);

      const gross = getTrendSeries(state, { months: 6, metric: "gross" });
      expect(gross.total.goal).toBeNull();

      const s2 = getTrendSeries(state, { months: 6, metric: "orders" });
      expect(s2.total.goal).toBeNull();
    });

    it("lacuna em mês sem dados (mesmo no meio)", () => {
      state.db["2026-Abril"] = { days: [], returns: {} };
      const s = getTrendSeries(state, { months: 12, metric: "gross" });
      const aprilIdx = s.periods.indexOf("2026-Abril");
      expect(aprilIdx).toBeGreaterThan(-1);
      expect(s.total.data[aprilIdx]).toBeNull();
    });

    it("mês sem plataforma específica fica null na série daquela plataforma", () => {
      const s = getTrendSeries(state, { months: 6, metric: "gross" });
      const sh = s.platforms.find((p) => p.key === "sh");
      // Fev não tem sh
      const fevIdx = s.periods.indexOf("2026-Fevereiro");
      expect(sh.data[fevIdx]).toBeNull();
    });

    it("retorna vazio se não há períodos", () => {
      state.db = {};
      const s = getTrendSeries(state, { months: 6, metric: "gross" });
      expect(s.periods).toEqual([]);
      expect(s.platforms).toEqual([]);
    });
  });
});
