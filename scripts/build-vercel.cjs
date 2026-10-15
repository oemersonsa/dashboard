const fs = require("node:fs");
const path = require("node:path");

require("./vendor.cjs");
require("./build.cjs");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "public");
const output = path.join(root, "dist");
// Destino fixo dentro do projeto, reservado aos artefatos de build.
fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, {
  recursive: true,
  filter: file => !/\.(br|gz)$/.test(file)
});
fs.copyFileSync(path.join(source, "compiled", "index.html"), path.join(output, "index.html"));
console.log("Interface pronta em dist/ para a CDN da Vercel.");
