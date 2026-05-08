/**
 * Prints a ready-to-paste Claude Desktop MCP config snippet with
 * absolute paths resolved for the current machine.
 *
 * Uses dist/index.js (compiled) if present, otherwise falls back to
 * src/index.ts with --experimental-strip-types for dev convenience.
 *
 * Run: pnpm run print-mcp-config
 * See: docs/claude-desktop-setup.md
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const MCP_DIST = resolve(ROOT, "packages/mcp/dist/index.js");
const MCP_SRC = resolve(ROOT, "packages/mcp/src/index.ts");

let nodePath = process.execPath;
try {
  nodePath = execSync("which node", { encoding: "utf8" }).trim() || nodePath;
} catch {}

const useDist = existsSync(MCP_DIST);
const args = useDist
  ? [MCP_DIST]
  : ["--experimental-strip-types", MCP_SRC];

if (!useDist) {
  console.log("# Note: dist/index.js not found — using source with --experimental-strip-types.");
  console.log("# Run `pnpm build` first to produce a compiled dist.");
  console.log("");
}

const config = {
  mcpServers: {
    rendersend: {
      command: nodePath,
      args,
      env: {
        RENDERSEND_API: "http://localhost:8787",
        RENDERSEND_VIEWER: "http://localhost:5173",
        // RENDERSEND_OWNER_EMAIL: "you@example.com",
      },
    },
  },
};

console.log("# Paste into ~/Library/Application Support/Claude/claude_desktop_config.json");
console.log("# Merge the `rendersend` key if you already have other MCP servers.");
console.log("");
console.log(JSON.stringify(config, null, 2));
console.log("");
console.log("# Then fully quit and reopen Claude Desktop (Cmd+Q).");
