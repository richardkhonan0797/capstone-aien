import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    build: {
      assetsDir: "senja-assets",
      rollupOptions: {
        input: {
          dashboard: resolve("dashboard/index.html"),
          chat: resolve("chat/index.html"),
        },
      },
    },
    server: {
      // Development only. Production uses same-origin Caddy routes.
      proxy: {
        "/webhook": {
          target: env.N8N_PROXY_TARGET || "http://127.0.0.1:5678",
          changeOrigin: true,
        },
      },
    },
  };
});
