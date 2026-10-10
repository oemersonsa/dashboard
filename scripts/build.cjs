const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const root = path.resolve(__dirname, "../public");
const output = path.join(root, "compiled");
fs.mkdirSync(output, { recursive: true });
function css(file, seen = new Set()) {
  if (seen.has(file)) throw new Error(`CSS import circular: ${file}`);
  const next = new Set(seen).add(file);
  return fs.readFileSync(file, "utf8").replace(/@import\s+url\(["']([^"']+)["']\);/g, (_, target) => css(path.resolve(path.dirname(file), target), next));
}
const styles = css(path.join(root, "styles/main.css"));
const hash = crypto.createHash("sha256").update(styles).digest("hex").slice(0, 12);
const name = `app.${hash}.css`;
fs.writeFileSync(path.join(output, name), styles);
fs.writeFileSync(path.join(output, "manifest.json"), JSON.stringify({ styles: `/compiled/${name}` }));
fs.writeFileSync(path.join(output, "index.html"), fs.readFileSync(path.join(root, "index.html"), "utf8").replace("/styles/main.css", `/compiled/${name}`));
function compress(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) compress(file);
    else if (/\.(html|css|js|json|svg)$/.test(entry.name)) {
      const data = fs.readFileSync(file);
      if (data.length < 1024) continue;
      fs.writeFileSync(`${file}.gz`, zlib.gzipSync(data));
      fs.writeFileSync(`${file}.br`, zlib.brotliCompressSync(data));
    }
  }
}
compress(root);
console.log(`CSS consolidado e arquivos comprimidos: ${name}`);
