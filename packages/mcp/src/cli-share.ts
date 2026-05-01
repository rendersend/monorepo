/**
 * Standalone CLI for testing the share flow.
 *
 *   echo '<h1>hi</h1>' | RENDERSEND_OWNER_EMAIL=alice@example.com pnpm share
 *   echo '<h1>hi</h1>' | RENDERSEND_OWNER_EMAIL=alice@example.com \
 *                       RENDERSEND_RECIPIENT_EMAILS=bob@example.com,carol@example.com pnpm share
 */
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
