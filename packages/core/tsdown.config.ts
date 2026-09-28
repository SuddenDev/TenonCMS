import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "tsdown";

// Rolldown has no `?raw` imports. This inlines the file as a string, as Vite does, for plugin CSS.
const raw = {
  name: "raw",
  resolveId: (id: string, importer?: string) =>
    id.endsWith("?raw") && importer ? resolve(dirname(importer), id) : undefined,
  load: (id: string) =>
    id.endsWith("?raw")
      ? `export default ${JSON.stringify(readFileSync(id.slice(0, -4), "utf8"))}`
      : undefined,
};

export default defineConfig({
  plugins: [raw],
  entry: [
    "src/index.ts",
    "src/client.ts",
    "src/astro/index.ts",
    "src/nuxt/index.ts",
    "src/admin/vue.ts",
    "src/admin/react.ts",
    "src/vite/index.ts",
    "src/presets/index.ts",
    "src/plugins/redirects/index.ts",
    "src/plugins/redirects/admin.ts",
  ],
  dts: true,
  // Runtime files ship as source. The host's Vite and Nitro compile them and resolve `#integral/config`.
  copy: [
    { from: "src/astro/route.ts", to: "dist/astro" },
    { from: "src/astro/middleware.ts", to: "dist/astro" },
    { from: "src/astro/admin.astro", to: "dist/astro" },
    { from: "src/nuxt/runtime", to: "dist/nuxt" },
    { from: "src/register.d.ts", to: "dist" },
    // The admin's Vite build writes index.js next to these.
    { from: "src/admin/index.d.ts", to: "dist/admin" },
    { from: "src/admin/default.ts", to: "dist/admin" },
    { from: "src/admin/entry.ts", to: "dist/admin" },
    { from: "src/admin/virtual.d.ts", to: "dist/admin" },
  ],
});
