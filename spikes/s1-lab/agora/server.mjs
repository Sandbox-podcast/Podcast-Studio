import { config } from "dotenv";
import agoraToken from "agora-token";

const { RtcRole, RtcTokenBuilder } = agoraToken;
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, ".env") });

const HOST = process.env.LAB_HOST ?? "127.0.0.1";
const PORT = Number(process.env.LAB_PORT ?? 5181);
const PUBLIC = join(__dirname, "public");

const appId = process.env.AGORA_APP_ID ?? "";
const certificate = process.env.AGORA_APP_CERTIFICATE ?? "";
const tempToken = process.env.AGORA_TEMP_TOKEN?.trim() ?? "";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

    if (url.pathname === "/api/join" && req.method === "GET") {
      const channel = url.searchParams.get("channel")?.trim() || "s1-lab";
      const identity = url.searchParams.get("identity")?.trim() || `lab-${Date.now()}`;
      if (!appId) {
        sendJson(res, 500, { error: "Set AGORA_APP_ID in agora/.env" });
        return;
      }
      const uid = uidFromIdentity(identity);
      const token = resolveToken(channel, uid);
      if (!token) {
        sendJson(res, 500, {
          error:
            "Set AGORA_APP_CERTIFICATE for local mint, or AGORA_TEMP_TOKEN from Agora Console (temp token tool)",
        });
        return;
      }
      sendJson(res, 200, { appId, channel, identity, uid, token });
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
}).listen(PORT, HOST, () => {
  console.log(`S1 Agora lab harness: http://${HOST}:${PORT}`);
  if (!appId) console.warn("Warning: set AGORA_APP_ID in agora/.env");
  if (!certificate && !tempToken) {
    console.warn("Warning: set AGORA_APP_CERTIFICATE or AGORA_TEMP_TOKEN for join tokens");
  }
});

function resolveToken(channel, uid) {
  if (certificate && appId) {
    const now = Math.floor(Date.now() / 1000);
    const expire = now + 6 * 3600;
    return RtcTokenBuilder.buildTokenWithUid(
      appId,
      certificate,
      channel,
      uid,
      RtcRole.PUBLISHER,
      expire,
      expire,
    );
  }
  if (tempToken) return tempToken;
  return null;
}

function uidFromIdentity(identity) {
  const hash = createHash("sha256").update(identity).digest();
  return hash.readUInt32BE(0) % 2_000_000_000 + 1;
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendText(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}
