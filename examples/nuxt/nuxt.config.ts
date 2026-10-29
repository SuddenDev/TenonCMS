import { resolve } from "node:path";

export default defineNuxtConfig({
  compatibilityDate: "2026-09-01",
  modules: ["tenoncms/nuxt"],
  // Set with NUXT_CMS_SECRET, NUXT_DATABASE_URL and NUXT_UPLOADS_DIR.
  runtimeConfig: {
    cmsSecret: "",
    // Absolute, because `nuxt preview` runs the server from inside .output/.
    databaseUrl: `file:${resolve("cms.db")}`,
    uploadsDir: resolve(".uploads"),
  },
});
