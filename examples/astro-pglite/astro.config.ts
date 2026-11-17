import node from "@astrojs/node";
import { defineConfig, envField } from "astro/config";
import tenonCms from "tenoncms/astro";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [tenonCms()],
  env: {
    schema: {
      TENON_SECRET: envField.string({ context: "server", access: "secret", min: 32 }),
      TENON_SITE_URL: envField.string({
        context: "server",
        access: "secret",
        url: true,
        optional: true,
      }),
      DATABASE_DIR: envField.string({
        context: "server",
        access: "secret",
        default: "./.data/cms",
      }),
    },
  },
});
