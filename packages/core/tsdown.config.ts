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
    "src/client/index.ts",
    "src/integrations/astro/index.ts",
    "src/integrations/nuxt/index.ts",
    "src/admin/vue.ts",
    "src/admin/react.ts",
    "src/preview/index.ts",
    "src/preview/vue.ts",
    "src/preview/react.ts",
    "src/integrations/vite/index.ts",
    "src/presets/index.ts",
    "src/plugins/redirects/index.ts",
    "src/plugins/redirects/admin.ts",
    // Own entries, so `node:fs`, `ipx` and `aws4fetch` stay out of bundles that do not use them.
    "src/media/storage/local/index.ts",
    "src/media/storage/s3/index.ts",
    "src/media/images/ipx.ts",
    "src/media/images/cloudflare.ts",
    "src/media/default.ts",
    // Cloudflare Workers resolve `local`, `ipx` and `default` here, by the `workerd` export condition.
    "src/media/workerd.ts",
  ],
  // Core imports its default media through the package exports, so Workers builds get `workerd.ts` instead.
  external: ["integral-cms/media/default"],
  dts: true,
  // Runtime files ship as source. The host's Vite and Nitro compile them and resolve `#integral/config`.
  copy: [
    { from: "src/integrations/astro/route.ts", to: "dist/integrations/astro" },
    { from: "src/integrations/astro/middleware.ts", to: "dist/integrations/astro" },
    { from: "src/integrations/astro/admin.astro", to: "dist/integrations/astro" },
    { from: "src/integrations/nuxt/runtime", to: "dist/integrations/nuxt" },
    { from: "src/client/register.d.ts", to: "dist/client" },
    // The admin's Vite build writes index.js next to these.
    { from: "src/admin/index.d.ts", to: "dist/admin" },
    { from: "src/admin/icons.d.ts", to: "dist/admin" },
    { from: "src/admin/default.ts", to: "dist/admin" },
    { from: "src/admin/entry.ts", to: "dist/admin" },
    { from: "src/admin/virtual.d.ts", to: "dist/admin" },
  ],
});
