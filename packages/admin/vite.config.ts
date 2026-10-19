import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";
import path from "path";

// The example dev server serves the API. `pnpm dev:<example>` sets CMS_URL.
const target = process.env.CMS_URL ?? "http://localhost:4321";

export default defineConfig(() => ({
  plugins: [vue(), tailwindcss()],
  test: { css: { include: [/richtext\/style\.css/] } },
  // vue-i18n feature flags: Composition API only, no devtools in production.
  define: {
    __VUE_I18N_FULL_INSTALL__: false,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false,
  },
  build: {
    // Vue is bundled in. Hosts plug in through `mount(el)`, so no shared runtime is needed.
    lib: {
      entry: { mount: "src/index.ts", bar: "src/admin-bar/index.ts" },
      formats: ["es"],
      fileName: (_, name) => `${name}.js`,
    },
    outDir: "../core/dist/admin",
    emptyOutDir: false,
  },
  css: {
    postcss: {
      plugins: [
        {
          // Chrome ignores `@property` in shadow roots, so the admin bar needs the fallbacks unconditionally.
          postcssPlugin: "unwrap-properties",
          AtRule: {
            supports(rule) {
              const parent = rule.parent;
              if (
                parent?.type === "atrule" &&
                "name" in parent &&
                parent.name === "layer" &&
                parent.params === "properties"
              )
                rule.replaceWith(rule.nodes ?? []);
            },
          },
        },
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // better-auth rejects requests whose origin differs from the API host.
    proxy: {
      "/api/cms": { target, changeOrigin: true, headers: { origin: target } },
    },
  },
}));
