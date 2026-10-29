import vercel from "@astrojs/vercel";
import { defineConfig, envField } from "astro/config";
import integralCms from "integral-cms/astro";

const secret = () => envField.string({ context: "server", access: "secret" });

export default defineConfig({
  output: "server",
  adapter: vercel(),
  integrations: [integralCms()],
  env: {
    schema: {
      CMS_SECRET: envField.string({ context: "server", access: "secret", min: 32 }),
      DATABASE_URL: secret(),
      // Any S3-compatible bucket. Neon's object storage hands out these names.
      AWS_ENDPOINT_URL_S3: envField.string({ context: "server", access: "secret", url: true }),
      AWS_ACCESS_KEY_ID: secret(),
      AWS_SECRET_ACCESS_KEY: secret(),
      AWS_REGION: secret(),
      S3_BUCKET: secret(),
    },
  },
});
