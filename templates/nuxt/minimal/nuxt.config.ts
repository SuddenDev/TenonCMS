// The saved theme, else the system's, before the first paint. ThemeSwitch.vue changes it.
const theme = `try {
  document.documentElement.dataset.theme =
    localStorage.getItem("theme") ??
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
} catch {}`;

export default defineNuxtConfig({
  compatibilityDate: "2026-09-01",
  modules: ["tenoncms/nuxt"],
  css: ["@fontsource-variable/geist", "~/assets/site.css"],
  app: { head: { htmlAttrs: { lang: "en" }, script: [{ innerHTML: theme }] } },
  // @tenon-options
  runtimeConfig: {
    // @tenon-runtime-config
  },
});
