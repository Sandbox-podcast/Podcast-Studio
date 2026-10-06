#!/usr/bin/env node
// S1 LAN 2nd publisher (desktop-ai): static localhost server (secure context, no deps, node built-ins only).
// Serves ./www (index.html + harness.js + pub2-sampler.js + media/ + token.json) on 127.0.0.1:PORT and appends
// POST /api/sample bodies (JSON) to OUT_DIR/pub2-samples.jsonl. Never binds the LAN; no firewall rule needed.
// Env: PORT (5191) OUT_DIR (./out)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { appendFileSync, mkdirSync, createReadStream } from "node:fs";
import { dirname, join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
const __dir = dirname(fileURLToPath(import.meta.url));
const WWW = join(__dir, "www");
const PORT = Number(process.env.PORT ?? 5191);
const OUT_DIR = process.env.OUT_DIR ?? join(__dir, "out");
mkdirSync(OUT_DIR, { recursive: true });
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webm": "video/webm", ".wav": "audio/wav", ".png": "image/png", ".ico": "image/png" };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
    if (req.method === "POST" && (url.pathname === "/api/sample" || url.pathname === "/api/log")) {
      let body = ""; for await (const ch of req) body += ch;
      appendFileSync(join(OUT_DIR, url.pathname === "/api/sample" ? "pub2-samples.jsonl" : "pub2-events.jsonl"), body.replace(/\n/g, " ") + "\n");
      res.writeHead(204); res.end(); return;
    }
    const p = normalize(join(WWW, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname)));
    if (!p.startsWith(WWW)) { res.writeHead(403); res.end(); return; }
    const st = await stat(p);
    const type = MIME[extname(p)] ?? "application/octet-stream";
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (range && st.size) {
      const start = range[1] ? Number(range[1]) : 0, end = range[2] ? Number(range[2]) : st.size - 1;
      res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Cache-Control": "no-store" });
      createReadStream(p, { start, end }).pipe(res); return;
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Accept-Ranges": "bytes", "Cache-Control": "no-store" });
    if (st.size > 4 * 1024 * 1024) createReadStream(p).pipe(res); else res.end(await readFile(p));
  } catch (e) {
    res.writeHead(e?.code === "ENOENT" ? 404 : 500); res.end(String(e?.code ?? "error"));
  }
}).listen(PORT, "127.0.0.1", () => console.log(`pub2 server http://localhost:${PORT} out=${OUT_DIR}`));
