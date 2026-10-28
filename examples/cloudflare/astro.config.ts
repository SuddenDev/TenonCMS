import cloudflare from "@astrojs/cloudflare";
import { defineConfig, envField } from "astro/config";
import integralCms from "integral-cms/astro";

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  integrations: [integralCms()],
  env: {
    schema: {
      CMS_SECRET: envField.string({ context: "server", access: "secret", min: 32 }),
    },
  },
});
