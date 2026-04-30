/**
 * Prints a ready-to-paste Claude Desktop MCP config snippet with
 * absolute paths resolved for the current machine. See
 * docs/claude-desktop-setup.md for the full setup walkthrough.
 */
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const MCP_ENTRY = resolve(ROOT, "packages/mcp/src/index.ts");

let nodePath = process.execPath;
try {
  nodePath = execSync("which node", { encoding: "utf8" }).trim() || nodePath;
} catch {}

const config = {
  mcpServers: {
    rendersend: {
      command: nodePath,
      args: ["--experimental-strip-types", MCP_ENTRY],
      env: {
        RENDERSEND_API: "http://localhost:8787",
        RENDERSEND_VIEWER: "http://localhost:5173",
      },
    },
  },
};

console.log("");
console.log("# Paste into ~/Library/Application Support/Claude/claude_desktop_config.json");
console.log("# (merge the `rendersend` entry if you already have other MCP servers)");
console.log("");
console.log(JSON.stringify(config, null, 2));
console.log("");
console.log("# Then fully quit and reopen Claude Desktop.");
