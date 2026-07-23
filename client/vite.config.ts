import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("../shared/src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
      "/visions": "http://localhost:8787",
      "/ws": { target: "ws://localhost:8787", ws: true },
    },
    fs: { allow: [".."] },
  },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        admin: fileURLToPath(new URL("admin.html", import.meta.url)),
        preview: fileURLToPath(new URL("preview.html", import.meta.url)),
      },
    },
  },
});
