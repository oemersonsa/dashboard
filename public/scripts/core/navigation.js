const screens = new Set(["hub", "dashboard", "dailyClose", "account"]);
const tabs = new Set(["overview", "daily", "weekly", "platforms", "trends", "entries", "projection", "calculator", "roas"]);
export function readRoute(hash) {
  const [path, query = ""] = String(hash || "").replace(/^#\/?/, "").split("?");
  const [screen, tab] = path.split("/");
  if (!screens.has(screen)) return null;
  const month = new URLSearchParams(query).get("month");
  return { screen, tab: tabs.has(tab) ? tab : "overview", month };
}
export function routeHash(screen, tab, month) {
  return `#/${screen}${screen === "dashboard" ? `/${tab}` : ""}?${new URLSearchParams({ month })}`;
}
