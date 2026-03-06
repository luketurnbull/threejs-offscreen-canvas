import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    headers: {
      // Required for SharedArrayBuffer
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  worker: {
    format: "es",
  },
  resolve: {
    alias: {
      "~/app": fileURLToPath(new URL("./src/app", import.meta.url)),
      "~/workers": fileURLToPath(new URL("./src/workers", import.meta.url)),
      "~/shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
    },
  },
});
