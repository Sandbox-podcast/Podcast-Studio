#!/usr/bin/env node
/**
 * Mint a LiveKit room JWT for local S1 lab use only.
 * Reads LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET from env or livekit/.env
 */
import { config } from "dotenv";
import { AccessToken } from "livekit-server-sdk";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });

function parseArgs(argv) {
  const out = { room: "s1-lab", identity: `lab-${Date.now()}`, ttl: "6h" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--room" && argv[i + 1]) out.room = argv[++i];
    else if (a === "--identity" && argv[i + 1]) out.identity = argv[++i];
    else if (a === "--ttl" && argv[i + 1]) out.ttl = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`Usage: node scripts/mint-token.mjs [--room NAME] [--identity ID] [--ttl 6h]

Prints a JWT to stdout. Requires LIVEKIT_API_KEY and LIVEKIT_API_SECRET in .env or environment.
`);
  process.exit(0);
}

const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;
const livekitUrl = process.env.LIVEKIT_URL;

if (!apiKey || !apiSecret) {
  console.error("Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET. Copy .env.example to .env");
  process.exit(1);
}

const ttlSeconds = parseTtl(args.ttl);

const at = new AccessToken(apiKey, apiSecret, {
  identity: args.identity,
  name: args.identity,
  ttl: ttlSeconds,
});

at.addGrant({
  roomJoin: true,
  room: args.room,
  canPublish: true,
  canSubscribe: true,
});

const jwt = await at.toJwt();

console.log(JSON.stringify({ url: livekitUrl ?? null, room: args.room, identity: args.identity, token: jwt }, null, 2));

function parseTtl(ttl) {
  const m = /^(\d+)(h|m|s)?$/i.exec(ttl.trim());
  if (!m) return 6 * 3600;
  const n = Number(m[1]);
  const unit = (m[2] ?? "s").toLowerCase();
  if (unit === "h") return n * 3600;
  if (unit === "m") return n * 60;
  return n;
}
