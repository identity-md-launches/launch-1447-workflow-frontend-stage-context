import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../../dist");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
};
const server = http.createServer((req, res) => {
  const raw = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const rel = raw.replace(/^\/preview\//, "") || "index.html";
  const file = path.resolve(root, rel);
  if (!raw.startsWith("/preview/") || !file.startsWith(root + path.sep)) {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
server.listen(4173, "0.0.0.0", () =>
  console.log("Production export: http://localhost:4173/preview/"),
);
setTimeout(() => server.close(), 20 * 60 * 1000);
process.on("SIGTERM", () => server.close());
