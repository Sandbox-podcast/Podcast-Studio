/**
 * Local-only static server + Daily room URL helper for S1 lab.
 */
import { config } from "dotenv";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, ".env") });

const HOST = process.env.LAB_HOST ?? "127.0.0.1";
const PORT = Number(process.env.LAB_PORT ?? 5180);
const PUBLIC = join(__dirname, "public");

const apiKey = process.env.DAILY_API_KEY ?? "";
const fixedRoomUrl = process.env.DAILY_ROOM_URL?.trim() ?? "";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

    if (url.pathname === "/api/join" && req.method === "GET") {
      const roomName = url.searchParams.get("room")?.trim() || "s1-lab";
      const userName = url.searchParams.get("userName")?.trim() || `lab-${Date.now()}`;
      const roomUrl = await resolveRoomUrl(roomName);
      if (!roomUrl) {
        sendJson(res, 500, {
          error:
            "Set DAILY_ROOM_URL in .env or DAILY_API_KEY to create/fetch rooms via REST (free dashboard)",
        });
        return;
      }
      sendJson(res, 200, { roomUrl, roomName, userName });
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
  console.log(`S1 Daily lab harness: http://${HOST}:${PORT}`);
  if (!fixedRoomUrl && !apiKey) {
    console.warn("Warning: set DAILY_ROOM_URL or DAILY_API_KEY in daily/.env");
  }
});

async function resolveRoomUrl(roomName) {
  if (fixedRoomUrl) return fixedRoomUrl;
  if (!apiKey) return null;

  const auth = { Authorization: `Bearer ${apiKey}` };
  const getRes = await fetch(`https://api.daily.co/v1/rooms/${encodeURIComponent(roomName)}`, {
    headers: auth,
  });
  if (getRes.ok) {
    const room = await getRes.json();
    return room.url;
  }
  if (getRes.status !== 404) {
    const text = await getRes.text();
    throw new Error(`Daily GET room failed: ${getRes.status} ${text}`);
  }

  const exp = Math.floor(Date.now() / 1000) + 24 * 3600;
  const createRes = await fetch("https://api.daily.co/v1/rooms", {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: roomName,
      properties: {
        exp,
        enable_chat: false,
        start_video_off: false,
        start_audio_off: false,
      },
    }),
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Daily CREATE room failed: ${createRes.status} ${text}`);
  }
  const created = await createRes.json();
  return created.url;
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendText(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}
