const DAY = 86400000;

export function syncPeriods(from, to) {
  const valid = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(from) || !valid(to) || from > to || from < "2000-01-01" || to > "2100-12-31") throw new Error("ml_invalid_date_range");
  const periods = [];
  for (let start = Date.parse(from); start <= Date.parse(to); start += 31 * DAY) {
    periods.push({ from: new Date(start).toISOString().slice(0, 10), to: new Date(Math.min(start + 30 * DAY, Date.parse(to))).toISOString().slice(0, 10) });
  }
  return periods;
}
