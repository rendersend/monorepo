/**
 * Build all distributable outputs.
 *
 *   pnpm build          — viewer static files + MCP compiled bundle
 *   pnpm build --watch  — not supported; use `pnpm dev` for incremental work
 *
 * Outputs:
 *   packages/viewer/dist/   Vite-built static files (serve with any web server)
 *   packages/mcp/dist/      tsup-bundled MCP server (node dist/index.js)
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

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

console.log("▶ building viewer (Vite)…");
await run("pnpm", ["--filter", "@rendersend/viewer", "build"], "viewer build");
console.log("✓ viewer → packages/viewer/dist/\n");

console.log("▶ building MCP server (tsup)…");
await run("pnpm", ["--filter", "@rendersend/mcp", "build"], "mcp build");
console.log("✓ MCP    → packages/mcp/dist/\n");

console.log("Build complete.");
console.log("");
console.log("Next steps:");
console.log("  pnpm run print-mcp-config   → generate Claude Desktop config snippet");
console.log("  pnpm release                → assemble release/ directory for deployment");
