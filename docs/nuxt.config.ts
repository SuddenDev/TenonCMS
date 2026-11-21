export default defineNuxtConfig({
  extends: ["docus"],
  site: {
    name: "Tenon CMS",
    // The sitemap needs a URL. Set NUXT_SITE_URL to the deployed origin.
    url: process.env.NUXT_SITE_URL || "http://localhost:3000",
  },
  content: {
    build: {
      markdown: {
        highlight: { langs: ["astro", "tsx", "jsx"] },
      },
    },
  },
  mdc: {
    // The landing page highlights its code samples while rendering. That needs the highlight route.
    highlight: { noApiRoute: false },
  },
  fonts: {
    // Nuxt Fonts only loads the first family of a font stack.
    // Inter Tight stands in for headings until the Nimbus Sans files are in `public/fonts`.
    families: [{ name: "Inter Tight", provider: "google", global: true }],
  },
});
