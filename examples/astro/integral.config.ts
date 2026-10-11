import { CMS_SECRET, DATABASE_URL, SITE_URL } from "astro:env/server";
import { defineCms, defineGlobal } from "integral-cms";
import { ExamplePlugin } from "integral-cms/plugins/example";
import { RedirectsPlugin } from "integral-cms/plugins/redirects";
import { authors } from "./collections/authors";
import { pages } from "./collections/pages";
import { posts } from "./collections/posts";

export default defineCms({
  collections: { posts, authors, pages },
  globals: {
    footer: defineGlobal({
      label: "Footer",
      description: "Links and copyright line",
      nav: { display: "settings", group: "Site", icon: "panel-bottom", order: 3 },
      fields: { copyright: { type: "text" } },
    }),
  },
  plugins: [RedirectsPlugin(), ExamplePlugin({ renderer: "html" })],
  database: { url: DATABASE_URL },
  secret: CMS_SECRET,
  site: SITE_URL,
  admin: {
    name: "Example site",
    media: { nav: { group: "Blog", icon: "images" } },
  },
});
