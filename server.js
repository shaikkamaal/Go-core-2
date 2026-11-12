// GoCore production server — zero dependencies.
// Usage:  node server.js        (or `npm start`)
// Serves ./dist on $PORT (default 3000). Builds the site first if ./dist is missing.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "dist");
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.log("[gocore] dist/ not found — running `npm run build` first…");
  execSync("npm run build", { cwd: __dirname, stdio: "inherit" });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".zip": "application/zip",
  ".webp": "image/webp",
};

const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY, ...headers });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method not allowed", { Allow: "GET, HEAD" });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return send(res, 400, "Bad request");
  }

  if (pathname === "/healthz") return send(res, 200, "ok", { "Content-Type": "text/plain" });

  // Resolve safely inside DIST (blocks ../ path traversal)
  let file = path.normalize(path.join(DIST, pathname));
  if (file !== DIST && !file.startsWith(DIST + path.sep)) return send(res, 403, "Forbidden");

  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  // Unknown path → fall back to index.html (the app uses hash routing, but this is harmless)
  if (!fs.existsSync(file)) file = path.join(DIST, "index.html");

  const ext = path.extname(file).toLowerCase();
  const isHtml = ext === ".html";
  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": isHtml ? "no-cache" : "public, max-age=31536000, immutable",
  };

  const stat = fs.statSync(file);
  headers["Content-Length"] = stat.size;
  res.writeHead(200, { ...SECURITY, ...headers });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`[gocore] serving ./dist on http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
