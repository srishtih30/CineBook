/*
 * Optional static file server for the CineBook frontend (plain Node, no npm install).
 *
 *   node server.js            -> http://localhost:5500
 *
 * Python works just as well:   python -m http.server 5500
 * The page talks to FastAPI on http://127.0.0.1:8000 directly (CORS is enabled
 * in backend/main.py), so any static server is fine.
 *
 * Note: opening index.html by double-clicking (file://) will NOT work, because
 * browsers block JavaScript modules loaded from file:// pages.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 5500;
const ROOT = __dirname;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";
    const file = path.normalize(path.join(ROOT, urlPath));

    if (!file.startsWith(ROOT) || file === __filename) {
      res.writeHead(403);
      return res.end("Forbidden");
    }

    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        return res.end("Not found");
      }
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(data);
    });
  })
  .listen(PORT, () => {
    console.log(`\n  CineBook frontend  ->  http://localhost:${PORT}`);
    console.log(`  Admin panel        ->  http://localhost:${PORT}/#/admin\n`);
  });
