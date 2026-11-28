import node from "@astrojs/node";
import { defineConfig, envField } from "astro/config";

// No `tenoncms/astro` integration: the CMS runs on its own origin, and this site reads from it over HTTP.
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  env: {
    schema: {
      // The CMS origin, without a path. The server reads content from it, and the browser loads the admin bar from it.
      TENON_CMS_URL: envField.string({
        context: "client",
        access: "public",
        url: true,
        default: "http://localhost:3200",
      }),
    },
  },
});
