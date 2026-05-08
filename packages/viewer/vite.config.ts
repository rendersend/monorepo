import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Match the rest of the monorepo: viewer dev server listens on 5173,
// API on 8787. SPA fallback (history API) is on by default in Vite,
// so /v/:id works without rewrites.
export default defineConfig({
  server: {
    host: "::",
    port: 5173,
    strictPort: true,
    hmr: { overlay: false },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
});
