import node from "@astrojs/node";
import { defineConfig, envField } from "astro/config";
import integralCms from "integral-cms/astro";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [integralCms()],
  env: {
    schema: {
      CMS_SECRET: envField.string({ context: "server", access: "secret", min: 32 }),
      DATABASE_DIR: envField.string({
        context: "server",
        access: "secret",
        default: "./.data/cms",
      }),
    },
  },
});
