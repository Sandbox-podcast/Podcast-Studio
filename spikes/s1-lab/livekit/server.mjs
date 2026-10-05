/**
 * Local-only static server + token endpoint for S1 lab harness.
 * Binds to 127.0.0.1 by default — do not expose API secrets to the public internet.
 */
import { config } from "dotenv";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { AccessToken } from "livekit-server-sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, ".env") });

const HOST = process.env.LAB_HOST ?? "127.0.0.1";
const PORT = Number(process.env.LAB_PORT ?? 5179);
const PUBLIC = join(__dirname, "public");

const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;
const livekitUrl = process.env.LIVEKIT_URL ?? "";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

    if (url.pathname === "/api/config" && req.method === "GET") {
      sendJson(res, 200, { url: livekitUrl });
      return;
    }

    if (url.pathname === "/api/token" && req.method === "GET") {
      if (!apiKey || !apiSecret) {
        sendJson(res, 500, { error: "Server missing LIVEKIT_API_KEY / LIVEKIT_API_SECRET (.env)" });
        return;
      }
      const room = url.searchParams.get("room")?.trim() || "s1-lab";
      const identity = url.searchParams.get("identity")?.trim() || `lab-${Date.now()}`;
      const token = await mintToken(room, identity);
      sendJson(res, 200, { url: livekitUrl, room, identity, token });
      return;
    }

    let filePath = join(PUBLIC, url.pathname === "/" ? "index.html" : url.pathname);
    if (!filePath.startsWith(PUBLIC)) {
      sendText(res, 403, "Forbidden");
      return;
    }

    const data = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(data);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      sendText(res, 404, "Not found");
      return;
    }
    console.error(err);
    sendText(res, 500, "Internal error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`S1 LiveKit lab harness: http://${HOST}:${PORT}`);
  if (!apiKey || !apiSecret || !livekitUrl) {
    console.warn("Warning: set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET in livekit/.env");
  }
});

async function mintToken(room, identity) {
  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    name: identity,
    ttl: 6 * 3600,
  });
  at.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
  });
  return at.toJwt();
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendText(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}
