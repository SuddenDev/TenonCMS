import node from "@astrojs/node";
import { defineConfig, envField } from "astro/config";
import tenonCms from "tenoncms/astro";

export default defineConfig({
  adapter: node({ mode: "standalone" }),
  integrations: [tenonCms()],
  env: {
    schema: {
      TENON_SECRET: envField.string({ context: "server", access: "secret", min: 32 }),
      SMTP_URL: envField.string({ context: "server", access: "secret", optional: true }),
      EMAIL_FROM: envField.string({
        context: "server",
        access: "secret",
        default: "Example site <hello@example.test>",
      }),
      DATABASE_URL: envField.string({
        context: "server",
        access: "secret",
        default: "file:./cms.db",
      }),
      TENON_SITE_URL: envField.string({
        context: "server",
        access: "secret",
        url: true,
        optional: true,
      }),
    },
  },
});
