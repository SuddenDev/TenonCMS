import { resolve } from "node:path";

export default defineNuxtConfig({
  compatibilityDate: "2026-09-01",
  modules: ["tenoncms/nuxt"],
  // Set with NUXT_TENON_SECRET, NUXT_TENON_SITE_URL, NUXT_DATABASE_URL and NUXT_UPLOADS_DIR.
  runtimeConfig: {
    tenonSecret: "",
    tenonSiteUrl: "",
    // Absolute, because `nuxt preview` runs the server from inside .output/.
    databaseUrl: `file:${resolve("cms.db")}`,
    uploadsDir: resolve(".uploads"),
  },
});
