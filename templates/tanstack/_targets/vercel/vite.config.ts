import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { tenonAdmin } from "tenoncms/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

// Vercel Image Optimization for `vercel()` images. `sizes` MUST equal `images.sizes` in tenon.config.ts.
const vercel = { config: { images: { sizes: [320, 640, 1024, 1536, 1920], domains: [] } } };

export default defineConfig({
  plugins: [
    tanstackStart(),
    nitro({ vercel }),
    viteReact(),
    // Vercel Hobby allows one cron job a day, so the every-minute job clock is off. Call the clock route instead:
    // https://tenoncms.com/docs/core/operations/jobs/clock#the-clock-route
    tenonAdmin({ jobs: false }),
  ],
});
