import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (path: string) => fileURLToPath(new URL(`src/${path}`, import.meta.url));

// Core imports its own `integral-cms/media/default` so hosts can swap it by export condition. Tests use the source.
// `integral-cms/admin/bar` is built by the admin package. Tests mock it, so the alias only has to resolve.
const alias = (mediaDefault: string) => ({
  "#integral/client-registry": src("admin/test-registry.ts"),
  "integral-cms/media/default": src(mediaDefault),
  "integral-cms/admin/bar": src("admin/bar.d.ts"),
  "integral-cms/admin": src("admin/config.ts"),
});

// `*.workerd.test.ts` runs in workerd, inside the Worker of `src/tests/workerd/`. The `pglite` and `sqlite` projects
// run the integration suite and the database tests again on PGlite and `node:sqlite`.
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: alias("media/default.ts") },
        test: { name: "node", exclude: ["**/node_modules/**", "**/*.workerd.test.ts"] },
      },
      {
        resolve: { alias: alias("media/default.ts") },
        test: {
          name: "pglite",
          include: ["src/tests/*.test.ts", "src/db/{migrations,queries}/**/*.test.ts"],
          exclude: ["**/*.workerd.test.ts"],
          env: { CMS_TEST_DB: "pglite" },
          // ponytail: each test boots its own PGlite, which takes seconds under load. Clone a migrated template
          // per worker if the suite gets too slow.
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
      {
        resolve: { alias: alias("media/default.ts") },
        test: {
          name: "sqlite",
          include: ["src/tests/*.test.ts", "src/db/{migrations,queries}/**/*.test.ts"],
          exclude: ["**/*.workerd.test.ts"],
          env: { CMS_TEST_DB: "sqlite" },
        },
      },
      {
        resolve: { alias: alias("media/workerd.ts") },
        plugins: [
          cloudflareTest({ wrangler: { configPath: "./src/tests/workerd/wrangler.jsonc" } }),
        ],
        test: { name: "workerd", include: ["src/**/*.workerd.test.ts"] },
      },
    ],
  },
});
