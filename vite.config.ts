import { fileURLToPath, URL } from "node:url";
import { defineConfig, type ProxyOptions } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

/**
 * `fm serve` rejects any request whose Sec-Fetch-Site is `same-site` or
 * `cross-site` — which every browser sends on a cross-origin fetch — and has
 * no flag to change that. Routing it through the dev server makes the
 * browser's request same-origin, which it accepts (ADR-0007).
 *
 * Ollama needs no proxy: it answers cross-origin requests from localhost.
 */
const proxy: Record<string, ProxyOptions> = {
  "/fm": {
    target: "http://127.0.0.1:1976",
    changeOrigin: false,
    rewrite: (path) => path.replace(/^\/fm/, ""),
  },
};

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: { proxy },
  preview: { proxy },
});
