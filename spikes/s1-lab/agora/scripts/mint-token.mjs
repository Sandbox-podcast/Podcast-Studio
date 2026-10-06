#!/usr/bin/env node
import { config } from "dotenv";
import agoraToken from "agora-token";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { RtcRole, RtcTokenBuilder } = agoraToken;

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });

function parseArgs(argv) {
  const out = { channel: "s1-lab", identity: `lab-${Date.now()}`, ttlHours: 6 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--channel" && argv[i + 1]) out.channel = argv[++i];
    else if (a === "--identity" && argv[i + 1]) out.identity = argv[++i];
    else if (a === "--ttl-hours" && argv[i + 1]) out.ttlHours = Number(argv[++i]);
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(`Usage: node scripts/mint-token.mjs [--channel NAME] [--identity ID] [--ttl-hours 6]

Requires AGORA_APP_ID and AGORA_APP_CERTIFICATE in .env (or env vars).
`);
  process.exit(0);
}

const appId = process.env.AGORA_APP_ID;
const certificate = process.env.AGORA_APP_CERTIFICATE;
if (!appId || !certificate) {
  console.error("Missing AGORA_APP_ID or AGORA_APP_CERTIFICATE");
  process.exit(1);
}

const uid = uidFromIdentity(args.identity);
const now = Math.floor(Date.now() / 1000);
const expire = now + args.ttlHours * 3600;

const token = RtcTokenBuilder.buildTokenWithUid(
  appId,
  certificate,
  args.channel,
  uid,
  RtcRole.PUBLISHER,
  expire,
  expire,
);

console.log(
  JSON.stringify({ appId, channel: args.channel, identity: args.identity, uid, token }, null, 2),
);

function uidFromIdentity(identity) {
  const hash = createHash("sha256").update(identity).digest();
  return hash.readUInt32BE(0) % 2_000_000_000 + 1;
}
