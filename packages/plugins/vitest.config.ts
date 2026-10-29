import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const core = (path: string) => fileURLToPath(new URL(`../core/src/${path}`, import.meta.url));

// Tests run against core's source, so they need no build.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^tenoncms\/richtext$/, replacement: core("richtext/index.ts") },
      { find: /^tenoncms$/, replacement: core("index.ts") },
      { find: /^tenoncms\/client$/, replacement: core("client/index.ts") },
      { find: /^tenoncms\/libsql$/, replacement: core("integrations/libsql/index.ts") },
      { find: /^tenoncms\/presets$/, replacement: core("presets/index.ts") },
      { find: /^tenoncms\/admin$/, replacement: core("admin/config.ts") },
      { find: /^tenoncms\/admin\/bar$/, replacement: core("admin/bar.d.ts") },
      { find: /^tenoncms\/media\/default$/, replacement: core("media/default.ts") },
      { find: "#tenon/client-registry", replacement: core("admin/test-registry.ts") },
    ],
  },
});
