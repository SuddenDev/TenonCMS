import { CMS_SECRET, DATABASE_URL } from "astro:env/server";
import { defineCms } from "integral-cms";
import { redirects } from "integral-cms/plugins/redirects";
import { authors } from "./collections/authors";
import { pages } from "./collections/pages";
import { posts } from "./collections/posts";

export default defineCms({
  collections: { posts, authors, pages },
  globals: {
    site: {
      label: "Site settings",
      fields: {
        title: { type: "text", required: true },
        tagline: { type: "text" },
      },
    },
  },
  plugins: [redirects()],
  database: { url: DATABASE_URL },
  secret: CMS_SECRET,
});
