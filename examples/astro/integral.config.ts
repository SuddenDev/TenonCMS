import { CMS_SECRET, DATABASE_URL, SITE_URL } from "astro:env/server";
import { defineCms, defineGlobal } from "integral-cms";
import { ExamplePlugin } from "integral-cms/plugins/example";
import { RedirectsPlugin } from "integral-cms/plugins/redirects";
import { strings } from "integral-cms/presets";
import { authors } from "./collections/authors";
import { pages } from "./collections/pages";
import { posts } from "./collections/posts";

export default defineCms({
  localization: { locales: ["en", "de"], defaultLocale: "en", fallback: false },
  collections: { posts, authors, pages },
  globals: {
    footer: defineGlobal({
      label: "Footer",
      description: "Links and copyright line",
      nav: { display: "settings", icon: "panel-bottom", order: 3 },
      fields: { copyright: { type: "text" } },
    }),
    strings: strings({
      allPosts: { label: "All posts link", default: { en: "All posts", de: "Alle Beiträge" } },
    }),
  },
  plugins: [RedirectsPlugin({ locales: ["en", "de"] }), ExamplePlugin({ renderer: "html" })],
  database: { url: DATABASE_URL },
  secret: CMS_SECRET,
  site: SITE_URL,
  admin: {
    name: "Example site",
    media: { nav: { group: "Blog", icon: "images" } },
  },
});
