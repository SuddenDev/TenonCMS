import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Core imports its own `integral-cms/media/default` so hosts can swap it by export condition. Tests use the source.
// `integral-cms/admin/bar` is built by the admin package. Tests mock it, so the alias only has to resolve.
export default defineConfig({
  resolve: {
    alias: {
      "integral-cms/media/default": fileURLToPath(new URL("src/media/default.ts", import.meta.url)),
      "integral-cms/admin/bar": fileURLToPath(new URL("src/admin/bar.d.ts", import.meta.url)),
    },
  },
});
