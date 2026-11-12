import { defineConfig, envField } from "astro/config";
import tenonCms from "tenoncms/astro";
// @tenon-imports

export default defineConfig({
  output: "server",
  // @tenon-options
  integrations: [tenonCms()],
  env: {
    schema: {
      // @tenon-env
    },
  },
});
