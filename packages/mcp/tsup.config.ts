import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "cli-share": "src/cli-share.ts",
  },
  format: ["esm"],
  target: "node20",
  bundle: true,
  // Bundle the workspace crypto package so the dist is self-contained
  noExternal: ["@rendersend/crypto"],
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
