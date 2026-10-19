import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const core = (path: string) => fileURLToPath(new URL(`../core/src/${path}`, import.meta.url));

// Tests run against core's source, so they need no build.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^integral-cms\/richtext$/, replacement: core("richtext/index.ts") },
      { find: /^integral-cms$/, replacement: core("index.ts") },
      { find: /^integral-cms\/client$/, replacement: core("client/index.ts") },
      { find: /^integral-cms\/presets$/, replacement: core("presets/index.ts") },
      { find: /^integral-cms\/admin$/, replacement: core("admin/config.ts") },
      { find: /^integral-cms\/admin\/bar$/, replacement: core("admin/bar.d.ts") },
      { find: /^integral-cms\/media\/default$/, replacement: core("media/default.ts") },
      { find: "#integral/client-registry", replacement: core("admin/test-registry.ts") },
    ],
  },
});
