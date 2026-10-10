const stable = value => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const equal = (a, b) => stable(a) === stable(b);

// Só considera resolvida uma edição quando todos os seus valores estão no servidor.
export function changesAlreadyApplied(changes, remote) {
  if ("platforms" in changes && !equal(changes.platforms, remote.platforms || [])) return false;
  if ("pricing" in changes && !equal(changes.pricing, remote.pricing || null)) return false;
  for (const [month, goal] of Object.entries(changes.goals || {})) {
    if (!equal(goal, remote.goals?.[month] ?? null)) return false;
  }
  for (const [month, change] of Object.entries(changes.months || {})) {
    const saved = remote.db?.[month];
    if (change === null) { if (saved) return false; else continue; }
    if (!saved) return false;
    const days = new Map((saved.days || []).map(day => [day.d, day]));
    if (change.deletedDays.some(date => days.has(date))) return false;
    for (const day of change.days) {
      const stored = days.get(day.d);
      if (!stored) return false;
      for (const key of new Set([...Object.keys(day), ...Object.keys(stored)])) {
        if (key !== "d" && Number(day[key] || 0) !== Number(stored[key] || 0)) return false;
      }
    }
    for (const [key, value] of Object.entries(change.returns)) {
      if (Number(value) !== Number(saved.returns?.[key] || 0)) return false;
    }
  }
  return true;
}

// Apenas meses presentes na base podem ser excluídos. Meses ainda não carregados
// não fazem parte da base nem da edição e nunca são tratados como exclusões.
export function diffBusiness(base = {}, next = {}) {
  const changes = {};
  if (!equal(base.platforms || [], next.platforms || [])) changes.platforms = next.platforms || [];
  if (!equal(base.pricing, next.pricing)) changes.pricing = next.pricing || null;
  const goals = {};
  for (const month of new Set([...Object.keys(base.goals || {}), ...Object.keys(next.goals || {})])) {
    if (!equal(base.goals?.[month], next.goals?.[month])) goals[month] = next.goals?.[month] || null;
  }
  if (Object.keys(goals).length) changes.goals = goals;
  const months = {};
  for (const month of new Set([...Object.keys(base.db || {}), ...Object.keys(next.db || {})])) {
    const before = base.db?.[month]; const after = next.db?.[month];
    if (!after) { months[month] = null; continue; }
    const oldDays = new Map((before?.days || []).map(day => [day.d, day]));
    const newDays = new Map((after.days || []).map(day => [day.d, day]));
    const days = [...newDays.values()].filter(day => !equal(day, oldDays.get(day.d)));
    const deletedDays = [...oldDays.keys()].filter(date => !newDays.has(date));
    const returns = {};
    for (const key of new Set([...Object.keys(before?.returns || {}), ...Object.keys(after.returns || {})])) {
      if (Number(before?.returns?.[key] || 0) !== Number(after.returns?.[key] || 0)) returns[key] = Number(after.returns?.[key] || 0);
    }
    if (!before || days.length || deletedDays.length || Object.keys(returns).length) months[month] = { days, deletedDays, returns };
  }
  if (Object.keys(months).length) changes.months = months;
  return changes;
}
