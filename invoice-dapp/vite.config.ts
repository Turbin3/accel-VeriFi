import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import nodeGlobalsPolyfill from "@esbuild-plugins/node-globals-polyfill";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      supported: {
        bigint: true,
      },
      plugins: [
        nodeGlobalsPolyfill.default({
          buffer: true,
          process: true,
        }),
      ],
    },
  },
  define: {
    global: "globalThis",
  },
});
