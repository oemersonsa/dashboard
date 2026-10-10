const fs = require("fs");
const path = require("path");
const { PUBLIC_DIR } = require("../config/paths");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2" };
const getContentType = file => MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
function sendText(res, status, text) { res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" }); res.end(text); }
async function serve(req, res, url) {
  const requested = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  let file = path.resolve(PUBLIC_DIR, requested);
  const relative = path.relative(PUBLIC_DIR, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return sendText(res, 403, "Forbidden");
  if (requested === "index.html" && process.env.NODE_ENV === "production") {
    const compiled = path.join(PUBLIC_DIR, "compiled/index.html");
    try { await fs.promises.access(compiled); file = compiled; } catch {}
  }
  let stat;
  try { stat = await fs.promises.stat(file); if (!stat.isFile()) return sendText(res, 404, "Not found"); }
  catch (error) { if (["ENOENT", "ENOTDIR"].includes(error.code)) return sendText(res, 404, "Not found"); throw error; }
  let served = file; let encoding = "";
  const accepts = String(req.headers["accept-encoding"] || "");
  for (const [name, suffix] of [["br", ".br"], ["gzip", ".gz"]]) {
    const quality = accepts.split(",").map(item => item.trim().split(";")).find(item => item[0] === name);
    if (!quality || quality.slice(1).some(item => /^\s*q=0(?:\.0*)?$/.test(item))) continue;
    try { const compressed = await fs.promises.stat(file + suffix); if (compressed.mtimeMs >= stat.mtimeMs) { served = file + suffix; encoding = name; break; } } catch {}
  }
  const etag = '"' + stat.mtimeMs.toString(16) + '-' + stat.size.toString(16) + '-' + encoding + '"';
  const lastModified = stat.mtime.toUTCString();
  const headers = { "Content-Type": getContentType(file), "Cache-Control": /\.[a-f0-9]{12}\./.test(file) ? "public, max-age=31536000, immutable" : "no-cache",
    ETag: etag, "Last-Modified": lastModified, Vary: [res.getHeader("Vary"), "Accept-Encoding"].filter(Boolean).join(", "), ...(encoding ? { "Content-Encoding": encoding } : {}) };
  if (req.headers["if-none-match"] ? req.headers["if-none-match"] === etag : req.headers["if-modified-since"] === lastModified) {
    res.writeHead(304, headers); res.end(); return;
  }
  res.writeHead(200, headers);
  const stream = fs.createReadStream(served);
  stream.on("error", () => res.destroy()); stream.pipe(res);
}
module.exports = { serve, getContentType };
