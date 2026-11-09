import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/richtext/index.ts",
    "src/integrations/vue/richtext.ts",
    "src/integrations/vue/index.ts",
    "src/integrations/react/richtext.ts",
    "src/client/index.ts",
    "src/integrations/astro/index.ts",
    "src/integrations/cloudflare/index.ts",
    // Own entries, so libsql, `node:sqlite`, `pg` and PGlite load only for the database that uses them.
    "src/integrations/libsql/index.ts",
    "src/integrations/sqlite/index.ts",
    "src/integrations/postgres/index.ts",
    "src/integrations/pglite/index.ts",
    "src/integrations/nuxt/index.ts",
    "src/admin/config.ts",
    "src/admin/vue/vue.ts",
    "src/admin/react/react.ts",
    "src/preview/index.ts",
    "src/integrations/vue/preview.ts",
    "src/integrations/react/preview.ts",
    "src/integrations/vite/index.ts",
    "src/presets/index.ts",
    "src/email/smtp.ts",
    // Own entries, so `node:fs`, `ipx` and `aws4fetch` stay out of bundles that do not use them.
    "src/media/storage/local/index.ts",
    "src/media/storage/s3/index.ts",
    "src/media/storage/r2/index.ts",
    "src/media/images/ipx.ts",
    "src/media/images/cloudflare.ts",
    "src/media/default.ts",
    // Cloudflare Workers resolve `local`, `ipx` and `default` here, by the `workerd` export condition.
    "src/media/workerd.ts",
  ],
  // Core imports its default media through the package exports, so Workers builds get `workerd.ts` instead.
  // The admin bar is built by the admin package; the host's bundler splits it into its own chunk.
  external: [
    "tenoncms",
    "tenoncms/media/default",
    "tenoncms/admin/bar",
    "tenoncms/admin",
    "#tenon/client-registry",
  ],
  dts: true,
  // Runtime files ship as source. The host's Vite and Nitro compile them and resolve `#tenon/config`.
  copy: [
    { from: "src/integrations/astro/Richtext.astro", to: "dist/integrations/astro" },
    { from: "src/integrations/astro/route.ts", to: "dist/integrations/astro" },
    { from: "src/integrations/astro/middleware.ts", to: "dist/integrations/astro" },
    { from: "src/integrations/astro/admin.astro", to: "dist/integrations/astro" },
    { from: "src/integrations/astro/cloudflare", to: "dist/integrations/astro" },
    { from: "src/integrations/nuxt/runtime", to: "dist/integrations/nuxt" },
    { from: "src/client/register.d.ts", to: "dist/client" },
    // The admin's Vite build writes mount.js next to these.
    { from: "src/admin/index.d.ts", to: "dist/admin" },
    { from: "src/admin/mount.d.ts", to: "dist/admin" },
    { from: "src/admin/bar.d.ts", to: "dist/admin" },
    { from: "src/admin/icons.d.ts", to: "dist/admin" },
    { from: "src/admin/entry.ts", to: "dist/admin" },
    { from: "src/admin/virtual.d.ts", to: "dist/admin" },
  ],
});
