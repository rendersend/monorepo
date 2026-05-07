/**
 * Standalone CLI for testing the share flow.
 *
 *   echo '<h1>hi</h1>' | RENDERSEND_OWNER_EMAIL=alice@example.com pnpm share
 *   echo '<h1>hi</h1>' | RENDERSEND_OWNER_EMAIL=alice@example.com \
 *                       RENDERSEND_RECIPIENT_EMAILS=bob@example.com,carol@example.com pnpm share
 */

// Load .env file manually (same logic as API server)
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPaths = [
  resolve(process.cwd(), ".env"),
  resolve(__dirname, "../../../.env"),
  resolve(__dirname, "../../../../.env"),
];

for (const path of envPaths) {
  if (existsSync(path)) {
    const envContent = readFileSync(path, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex > 0) {
          const key = trimmed.slice(0, eqIndex).trim();
          let value = trimmed.slice(eqIndex + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
    break;
  }
}

import { shareHtml } from "./share.ts";

const API_BASE = process.env.RENDERSEND_API ?? "http://localhost:8787";
const VIEWER_BASE = process.env.RENDERSEND_VIEWER ?? "http://localhost:5173";
const OWNER_EMAIL = process.env.RENDERSEND_OWNER_EMAIL ?? "";
const RECIPIENT_EMAILS = process.env.RENDERSEND_RECIPIENT_EMAILS ?? "";

if (!OWNER_EMAIL) {
  console.error("RENDERSEND_OWNER_EMAIL env var is required");
  process.exit(1);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const html = await readStdin();
if (!html.trim()) {
  console.error("usage: echo '<html>...</html>' | RENDERSEND_OWNER_EMAIL=... pnpm share");
  process.exit(1);
}

const recipientEmails = RECIPIENT_EMAILS
  ? RECIPIENT_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
  : null;

const result = await shareHtml(html, {
  apiBase: API_BASE,
  viewerBase: VIEWER_BASE,
  ownerEmail: OWNER_EMAIL,
  recipientEmails,
});
console.log(JSON.stringify(result, null, 2));
