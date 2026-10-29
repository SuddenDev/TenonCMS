import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { defineConfig } from "tsdown";
import tailwind from "@tailwindcss/postcss";
import Vue from "unplugin-vue/rolldown";

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

// Bundled into the admin chunks, so hosts install neither Vue nor React.
const bundled = /^(vue|react|react-dom|scheduler)(\/|$)|^@vue\/|^tenoncms\/admin\/(vue|react)$/;

// The plugins ship inside `tenoncms` as `tenoncms/plugins/<name>`, so core MUST build first.
export default defineConfig({
  plugins: [raw, Vue({ isProduction: true })],
  entry: [
    "src/redirects/index.ts",
    "src/redirects/admin.ts",
    "src/example/index.ts",
    "src/example/admin/richtext.ts",
    "src/example/admin/html/index.ts",
    "src/example/admin/html/bar.ts",
    "src/example/admin/vue/index.ts",
    "src/example/admin/vue/bar.ts",
    "src/example/admin/react/index.ts",
    "src/example/admin/react/bar.ts",
  ],
  outDir: "../core/dist/plugins",
  // Core and its dependencies, which resolve from inside `tenoncms`.
  external: (id: string, importer?: string) =>
    !!importer && !id.startsWith(".") && !isAbsolute(id) && !bundled.test(id),
  platform: "neutral",
  // Keeps CSS imports in the output, one file per chunk, so only styled entries load CSS.
  // Tailwind has no preflight here, so it adds only the utilities that the plugin's React code uses.
  css: {
    inject: true,
    splitting: true,
    transformer: "postcss",
    postcss: { plugins: [tailwind()] },
  },
  fixedExtension: true,
  define: {
    "process.env.NODE_ENV": '"production"',
    __VUE_OPTIONS_API__: "true",
    __VUE_PROD_DEVTOOLS__: "false",
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
  },
  // Without the source paths, so the declarations import `tenoncms` instead of inlining it.
  tsconfig: "tsconfig.build.json",
  dts: { vue: true },
});
