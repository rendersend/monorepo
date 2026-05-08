/**
 * Run the API and viewer dev servers together for prototype manual testing.
 *
 *   node --experimental-strip-types scripts/dev.mjs
 *
 * Then in another terminal, share something:
 *   echo '<h1>hello</h1>' | pnpm --filter @rendersend/mcp share
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const procs = [
  spawn("pnpm", ["--filter", "@rendersend/api", "dev"], { cwd: ROOT, stdio: "inherit" }),
  spawn("pnpm", ["--filter", "@rendersend/viewer", "dev"], { cwd: ROOT, stdio: "inherit" }),
];

const shutdown = () => {
  for (const p of procs) {
    if (!p.killed) p.kill("SIGTERM");
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
for (const p of procs) p.on("exit", shutdown);
