import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Core imports its own `integral-cms/media/default` so hosts can swap it by export condition. Tests use the source.
export default defineConfig({
  resolve: {
    alias: {
      "integral-cms/media/default": fileURLToPath(new URL("src/media/default.ts", import.meta.url)),
    },
  },
});
