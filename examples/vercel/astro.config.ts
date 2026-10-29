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
      // Set by the AWS S3 integration from the Vercel Marketplace.
      AWS_REGION: secret(),
      AWS_ROLE_ARN: secret(),
      S3_BUCKET_NAME: secret(),
      MEDIA_URL: envField.string({ context: "server", access: "secret", url: true }),
    },
  },
});
