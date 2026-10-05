const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const target = path.join(root, "public", "vendor");
fs.mkdirSync(target, { recursive: true });
for (const [source, name] of [
  ["chart.js/dist/chart.umd.js", "chart.umd.js"],
  ["html2canvas/dist/html2canvas.min.js", "html2canvas.min.js"],
  ["chart.js/LICENSE.md", "chart.LICENSE.md"],
  ["html2canvas/LICENSE", "html2canvas.LICENSE"]
]) fs.copyFileSync(path.join(root, "node_modules", source), path.join(target, name));
