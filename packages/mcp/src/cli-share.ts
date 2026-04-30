/**
 * Standalone CLI: pipe HTML in, get a share link out.
 * Used both as a developer convenience and by the e2e test script.
 *
 *   echo "<h1>hi</h1>" | pnpm --filter @rendersend/mcp share
 */
import { shareHtml } from "./share.ts";

const API_BASE = process.env.RENDERSEND_API ?? "http://localhost:8787";
const VIEWER_BASE = process.env.RENDERSEND_VIEWER ?? "http://localhost:5173";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const html = await readStdin();
if (!html.trim()) {
  console.error("usage: echo '<html>...</html>' | pnpm share");
  process.exit(1);
}

const result = await shareHtml(html, { apiBase: API_BASE, viewerBase: VIEWER_BASE });
console.log(JSON.stringify(result, null, 2));
