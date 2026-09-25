// Local preview using production download routes, without credentials or analytics.
import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "./site-worker.mjs";

const root = fileURLToPath(new URL("../website/", import.meta.url));
const port = Number(process.env.PORT || 5307);
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
};
const assets = {
  async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const candidates = extname(relative) ? [relative] : [relative + ".html", relative];
    for (const candidate of candidates) {
      try {
        const path = await realpath(resolve(root, candidate));
        if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) continue;
        const body = await readFile(path);
        return new Response(request.method === "HEAD" ? null : body, {
          headers: { "content-type": types[extname(path)] || "application/octet-stream" },
        });
      } catch { /* Try extensionless fallback, then the site's 404 page. */ }
    }
    return new Response("Not found", { status: 404 });
  },
};

createServer(async (req, res) => {
  try {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    const url = new URL(req.url, "http://127.0.0.1");
    const request = new Request("https://clutterdock.com" + url.pathname + url.search, { method: req.method });
    const response = await worker.fetch(request, { ASSETS: assets }, { waitUntil() {} });
    res.writeHead(response.status, { ...Object.fromEntries(response.headers), "cache-control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500).end("Preview request failed");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`ClutterDock preview: http://127.0.0.1:${port} (no live analytics or checkout credentials)`);
});
