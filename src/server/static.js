const fs = require("fs");
const path = require("path");
const { PUBLIC_DIR } = require("../config/paths");

const STATIC_FILES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/scripts/main.js", "scripts/main.js"],
  ["/styles/main.css", "styles/main.css"],
  ["/assets/favicon.svg", "assets/favicon.svg"]
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function getContentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function serve(req, res, url) {
  const mapped = STATIC_FILES.get(url.pathname);
  const requested = mapped || url.pathname.replace(/^\/+/, "");
  const filePath = path.join(PUBLIC_DIR, requested);
  const normalized = path.normalize(filePath);

  if (!normalized.startsWith(PUBLIC_DIR)) return sendText(res, 403, "Forbidden");
  if (!fs.existsSync(normalized) || !fs.statSync(normalized).isFile()) {
    return sendText(res, 404, "Not found");
  }

  const stat = fs.statSync(normalized);
  const etag = `"${stat.mtimeMs.toString(16)}-${stat.size.toString(16)}"`;
  const lastModified = stat.mtime.toUTCString();

  if (req.headers["if-none-match"] === etag || req.headers["if-modified-since"] === lastModified) {
    res.writeHead(304, { ETag: etag, "Last-Modified": lastModified });
    res.end();
    return;
  }

  res.writeHead(200, {
    "Content-Type": getContentType(normalized),
    "Cache-Control": "no-cache",
    "ETag": etag,
    "Last-Modified": lastModified
  });
  fs.createReadStream(normalized).pipe(res);
}

module.exports = { serve, getContentType };