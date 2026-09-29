// Presets run in browser bundles too, so this file MUST NOT import zod or server code.
import type { Global } from "../schema/index.ts";

const general = {
  label: "General",
  description: "Site title, tagline, URL and favicon.",
  nav: { display: "settings", group: "Site", icon: "settings", order: 1 },
  fields: {
    title: { type: "text", required: true, description: "Name of the site." },
    tagline: { type: "text", description: "Short line that describes the site." },
    url: {
      type: "text",
      pattern: "https?://\\S+",
      description: "Site URL, used for canonical and social links.",
    },
    favicon: { type: "image", description: "Icon shown in browser tabs." },
  },
} as const satisfies Global;

const seo = {
  label: "SEO",
  description: "Search and social defaults for every page.",
  nav: { display: "settings", group: "Site", icon: "search", order: 2 },
  fields: {
    separator: {
      type: "text",
      default: " · ",
      description: "Text between the page title and the site title.",
    },
    image: {
      type: "image",
      description: "Fallback social image. Recommended size: 1200×630.",
    },
    verification: {
      type: "group",
      label: "Verification",
      description: "Codes that prove you own the site.",
      fields: {
        google: { type: "text", description: "Google Search Console verification code." },
        bing: { type: "text", description: "Bing Webmaster Tools verification code." },
      },
    },
    noindex: {
      type: "boolean",
      label: "Hide from search engines",
      description: "Ask search engines not to index any page.",
    },
  },
} as const satisfies Global;

/**
 * The default settings globals. `defineCms()` adds both unless the `settings` option says otherwise.
 * Spread one to extend it: `{ ...settings.general, fields: { ...settings.general.fields, analyticsId: { type: 'text' } } }`.
 */
export const settings = { general, seo };
