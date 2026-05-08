/**
 * Assemble a self-contained release/ directory ready for VPS deployment.
 *
 *   pnpm release
 *
 * What it does:
 *   1. Runs `pnpm build` (viewer + mcp).
 *   2. Copies build outputs + API source into release/.
 *   3. Writes release/.env.example and release/start.sh.
 *
 * Deployment on a VPS (no Docker):
 *   scp -r release/ user@server:/opt/rendersend
 *   ssh user@server "cd /opt/rendersend/api && npm install --omit=dev"
 *   # configure nginx to serve release/viewer/ as static files
 *   # start the API (see release/start.sh)
 */
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const ROOT = resolve(import.meta.dirname, "..");
const RELEASE_DIR = join(ROOT, "release");

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

function run(cmd, args, label) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with code ${code}`));
    });
  });
}

// ── 1. build ──────────────────────────────────────────────────────────────────
console.log("▶ building…");
await run("node", ["scripts/build.mjs"], "build");

// ── 2. assemble release/ ──────────────────────────────────────────────────────
console.log(`\n▶ assembling release/ (v${version})…`);
await rm(RELEASE_DIR, { recursive: true, force: true });
await mkdir(RELEASE_DIR, { recursive: true });

// API — source files only; deps installed on the server
const viewerDist = join(ROOT, "packages/viewer/dist");
const mcpDist = join(ROOT, "packages/mcp/dist");
const apiSrc = join(ROOT, "packages/api");

if (!existsSync(viewerDist)) throw new Error("packages/viewer/dist not found — build failed?");
if (!existsSync(mcpDist)) throw new Error("packages/mcp/dist not found — build failed?");

await cp(viewerDist, join(RELEASE_DIR, "viewer"), { recursive: true });
await cp(mcpDist, join(RELEASE_DIR, "mcp"), { recursive: true });
await cp(join(apiSrc, "src"), join(RELEASE_DIR, "api", "src"), { recursive: true });
await cp(join(apiSrc, "package.json"), join(RELEASE_DIR, "api", "package.json"));

// ── 3. .env.example ───────────────────────────────────────────────────────────
await writeFile(
  join(RELEASE_DIR, ".env.example"),
  [
    "# Rendersend API environment variables",
    "# Copy to .env and fill in your values",
    "",
    "PORT=8787",
    "STORAGE_DIR=./data",
    "RENDERSEND_DB=sqlite",
    "RENDERSEND_DB_PATH=./data/rendersend.db",
    "",
    "# CORS origin for the viewer (set to your production domain)",
    "# VIEWER_ORIGIN=https://rendersend.example.com",
  ].join("\n") + "\n",
);

// ── 4. start.sh ───────────────────────────────────────────────────────────────
const startSh = [
  "#!/bin/sh",
  "# Start the Rendersend API",
  "# Run from the release root: sh start.sh",
  "",
  "set -e",
  "cd \"$(dirname \"$0\")\"",
  "",
  "if [ ! -d api/node_modules ]; then",
  "  echo '→ installing API dependencies…'",
  "  cd api && npm install --omit=dev && cd ..",
  "fi",
  "",
  ". ./.env 2>/dev/null || true",
  "",
  "PORT=${PORT:-8787}",
  "STORAGE_DIR=${STORAGE_DIR:-./data}",
  "",
  "echo \"→ starting API on :${PORT}\"",
  "exec node --experimental-strip-types api/src/server.ts",
].join("\n") + "\n";

await writeFile(join(RELEASE_DIR, "start.sh"), startSh, { mode: 0o755 });

// ── summary ───────────────────────────────────────────────────────────────────
console.log("\nrelease/ contents:");
console.log("  viewer/       — static files (serve with nginx / any CDN)");
console.log("  mcp/          — compiled MCP server (node mcp/index.js)");
console.log("  api/          — API source (node --experimental-strip-types api/src/server.ts)");
console.log("  .env.example  — environment variable reference");
console.log("  start.sh      — API startup script");
console.log("");
console.log("Deploy:");
console.log("  scp -r release/ user@server:/opt/rendersend");
console.log("  ssh user@server 'cd /opt/rendersend && sh start.sh'");
console.log("  # point nginx at /opt/rendersend/viewer for the viewer static files");
