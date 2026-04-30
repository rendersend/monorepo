import { defineConfig } from "vite";

/**
 * Rewrite /v/:id requests to viewer.html so the URL shape used by the
 * MCP package (/v/{id}#{key}) works against the dev server. In production
 * this is handled at the edge (Cloudflare Pages or Worker route).
 */
const viewerRouteRewrite = {
  name: "rendersend-viewer-route",
  configureServer(server: { middlewares: { use: (fn: unknown) => void } }) {
    server.middlewares.use((
      req: { url?: string },
      _res: unknown,
      next: () => void,
    ) => {
      if (req.url && /^\/v\/[0-9a-f]{32}(\?|$)/.test(req.url)) {
        req.url = "/viewer.html";
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [viewerRouteRewrite],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        index: "./index.html",
        viewer: "./viewer.html",
      },
    },
  },
  optimizeDeps: {
    // Force pre-bundling so the workspace package is loaded as a module
    // by the dev server without separate build steps.
    include: ["@rendersend/crypto"],
  },
});
