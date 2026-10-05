import node from "@astrojs/node";
import { defineConfig, envField } from "astro/config";
import integralCms from "integral-cms/astro";

export default defineConfig({
  adapter: node({ mode: "standalone" }),
  integrations: [
    integralCms(),
    // Loads the site's own admin bar items on every page.
    {
      name: "admin-bar-items",
      hooks: {
        "astro:config:setup": ({ injectScript }) =>
          injectScript("page", 'import "/src/admin-bar.ts";'),
      },
    },
  ],
  env: {
    schema: {
      CMS_SECRET: envField.string({ context: "server", access: "secret", min: 32 }),
      DATABASE_URL: envField.string({
        context: "server",
        access: "secret",
        default: "file:./cms.db",
      }),
      SITE_URL: envField.string({
        context: "server",
        access: "public",
        url: true,
        default: "http://localhost:4321",
      }),
    },
  },
});
