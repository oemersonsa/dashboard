import { describe, it, expect, beforeEach } from "vitest";
import {
  computeGoalProgress,
  parseGoalInput,
  getStatusColorVar,
  GOAL_STATUS
} from "../../public/scripts/features/goals/goals.calc.js";
import { state } from "../../public/scripts/core/state.js";

function seedState() {
  state.platforms = [
    { key: "ml", name: "Mercado Livre", icon: "ML", color: "#ffe500", iconText: "#000" }
  ];
  state.db = {
    "2026-Setembro": {
      days: [
        { d: "01/09", ml: 1000, orders_ml: 10 },
        { d: "02/09", ml: 2000, orders_ml: 15 },
        { d: "03/09", ml: 1500, orders_ml: 12 }
      ],
      returns: { ml: 100 }
    }
  };
  state.currentMonth = "2026-Setembro";
}

describe("goals.calc.js", () => {
  beforeEach(seedState);

  describe("parseGoalInput", () => {
    it("aceita valor inteiro", () => {
      expect(parseGoalInput("50000")).toBe(50000);
    });

    it("aceita vírgula decimal", () => {
      expect(parseGoalInput("50000,50")).toBe(50000.5);
    });

    it("aceita ponto decimal", () => {
      expect(parseGoalInput("50000.50")).toBe(50000.5);
    });

    it("aceita formato R$", () => {
      expect(parseGoalInput("R$ 50.000,00")).toBe(50000);
    });

    it("retorna 0 para vazio", () => {
      expect(parseGoalInput("")).toBe(0);
      expect(parseGoalInput(null)).toBe(0);
      expect(parseGoalInput(undefined)).toBe(0);
    });

    it("retorna 0 para negativo", () => {
      expect(parseGoalInput("-100")).toBe(0);
    });

    it("retorna 0 para texto inválido", () => {
      expect(parseGoalInput("abc")).toBe(0);
    });
  });

  describe("computeGoalProgress — sem meta", () => {
    it("retorna hasGoal: false", () => {
      const p = computeGoalProgress("2026-Setembro", 0, state);
      expect(p.hasGoal).toBe(false);
      expect(p.status).toBe(GOAL_STATUS.SEM_META);
    });

    it("retorna realized mesmo sem meta", () => {
      const p = computeGoalProgress("2026-Setembro", 0, state);
      expect(p.realized).toBe(4400);
    });
  });

  describe("computeGoalProgress — com meta", () => {
    it("meta atingida", () => {
      const p = computeGoalProgress("2026-Setembro", 3000, state);
      expect(p.hasGoal).toBe(true);
      expect(p.realized).toBe(4400);
      expect(p.status).toBe(GOAL_STATUS.ATINGIDA);
      expect(p.percent).toBeGreaterThanOrEqual(100);
    });

    it("no ritmo (projeção ≥ meta)", () => {
      // realizado líquido 4400 em 3 dias → projeção 44000/mês
      const p = computeGoalProgress("2026-Setembro", 40000, state);
      expect(p.status).toBe(GOAL_STATUS.NO_RITMO);
    });

    it("atenção (projeção entre 90% e 100% da meta)", () => {
      // projeção líquida ~44000 → meta 47000 cai em atenção
      const p = computeGoalProgress("2026-Setembro", 47000, state);
      expect(p.status).toBe(GOAL_STATUS.ATENCAO);
    });

    it("risco (projeção < 90% da meta)", () => {
      const p = computeGoalProgress("2026-Setembro", 100000, state);
      expect(p.status).toBe(GOAL_STATUS.RISCO);
    });

    it("percentual correto", () => {
      const p = computeGoalProgress("2026-Setembro", 9000, state);
      expect(p.percent).toBeCloseTo(48.9, 1);
    });

    it("remaining correto", () => {
      const p = computeGoalProgress("2026-Setembro", 10000, state);
      expect(p.remaining).toBe(5600);
    });

    it("dailyNeeded quando há dias restantes", () => {
      // mês 30 dias, último lançado dia 3 → 27 dias restantes
      const p = computeGoalProgress("2026-Setembro", 10000, state);
      expect(p.daysLeft).toBe(27);
      expect(p.dailyNeeded).toBeCloseTo(5600 / 27, 2);
    });

    it("dailyNeeded = 0 quando mês encerrado", () => {
      const lastDay = getMonthDaysTest("2026-Setembro");
      state.db["2026-Setembro"].days = [
        { d: `30/09`, ml: 1000, orders_ml: 10 }
      ];
      const p = computeGoalProgress("2026-Setembro", 50000, state);
      expect(p.daysLeft).toBe(0);
      expect(p.dailyNeeded).toBe(0);
    });

    it("mês sem dias lançados: projeção 0, status risco", () => {
      state.db["2026-Outubro"] = { days: [], returns: {} };
      const p = computeGoalProgress("2026-Outubro", 10000, state);
      expect(p.realized).toBe(0);
      expect(p.projected).toBe(0);
      expect(p.status).toBe(GOAL_STATUS.RISCO);
      expect(p.dailyNeeded).toBeGreaterThan(0);
    });

    it("meta zerada retorna SEM_META", () => {
      const p = computeGoalProgress("2026-Setembro", 0, state);
      expect(p.status).toBe(GOAL_STATUS.SEM_META);
    });
  });

  describe("getStatusColorVar", () => {
    it("ATINGIDA → --green", () => {
      expect(getStatusColorVar(GOAL_STATUS.ATINGIDA)).toBe("--green");
    });
    it("NO_RITMO → --green", () => {
      expect(getStatusColorVar(GOAL_STATUS.NO_RITMO)).toBe("--green");
    });
    it("ATENCAO → --accent-4", () => {
      expect(getStatusColorVar(GOAL_STATUS.ATENCAO)).toBe("--accent-4");
    });
    it("RISCO → --red", () => {
      expect(getStatusColorVar(GOAL_STATUS.RISCO)).toBe("--red");
    });
    it("SEM_META → --muted", () => {
      expect(getStatusColorVar(GOAL_STATUS.SEM_META)).toBe("--muted");
    });
  });
});

/* helper de teste para não depender de import extra */
function getMonthDaysTest(month) {
  const mi = ["Janeiro","Fevereiro","Marco","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].indexOf(month.split("-")[1]);
  const year = Number(month.split("-")[0]);
  return new Date(year, mi + 1, 0).getDate();
}
