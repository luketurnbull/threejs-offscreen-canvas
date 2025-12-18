import { fileURLToPath, URL } from "node:url";
import glsl from "vite-plugin-glsl";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [glsl()],
  worker: {
    format: "es",
    plugins: () => [glsl()],
  },
  resolve: {
    alias: {
      "~/app": fileURLToPath(new URL("./src/app", import.meta.url)),
      "~/workers": fileURLToPath(new URL("./src/workers", import.meta.url)),
      "~/shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      "~/utils": fileURLToPath(new URL("./src/utils", import.meta.url)),
      "~/types": fileURLToPath(new URL("./src/types", import.meta.url)),
      "~/constants": fileURLToPath(new URL("./src/constants", import.meta.url)),
      "~/experience": fileURLToPath(
        new URL("./src/experience", import.meta.url),
      ),
      "~/shaders": fileURLToPath(new URL("./src/shaders", import.meta.url)),
    },
  },
});
