import { it, expect } from "vitest";
import { createRequire } from "node:module";
import { syncPeriods } from "../../public/scripts/features/integrations/mercado-livre-period.js";
const require = createRequire(import.meta.url);
const { range } = require("../../src/services/mercado-livre.service");

it("accepts all 31 days of a month in a single query", () => {
  expect(syncPeriods("2026-10-01", "2026-10-31")).toEqual([{ from: "2026-10-01", to: "2026-10-31" }]);
  expect(range({ from: "2026-10-01", to: "2026-10-31" }, 31).to).toBe("2026-10-31");
  expect(() => range({ from: "2026-10-01", to: "2026-11-01" }, 31)).toThrow("ml_invalid_date_range");
});
it("splits custom periods without gaps or overlapping dates, including leap days", () => {
  expect(syncPeriods("2024-01-31", "2024-04-03")).toEqual([
    { from: "2024-01-31", to: "2024-03-01" }, { from: "2024-03-02", to: "2024-04-01" }, { from: "2024-04-02", to: "2024-04-03" }
  ]);
  expect(syncPeriods("2026-10-31", "2026-10-31")).toHaveLength(1);
});
it.each([["2026-02-30", "2026-03-01"], ["", "2026-01-01"], ["2026-10-02", "2026-10-01"]])("rejects invalid custom dates %s to %s", (from, to) => {
  expect(() => syncPeriods(from, to)).toThrow("ml_invalid_date_range");
});
