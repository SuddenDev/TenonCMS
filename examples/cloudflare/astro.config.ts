import cloudflare from "@astrojs/cloudflare";
import { defineConfig, envField } from "astro/config";
import tenonCms from "tenoncms/astro";

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  integrations: [tenonCms()],
  env: {
    schema: {
      CMS_SECRET: envField.string({ context: "server", access: "secret", min: 32 }),
    },
  },
});
