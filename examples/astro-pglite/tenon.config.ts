import { PGlite } from "@electric-sql/pglite";
import { DATABASE_DIR, TENON_SECRET, TENON_SITE_URL } from "astro:env/server";
import { defineCms } from "tenoncms";
import { pglite } from "tenoncms/pglite";

export default defineCms({
  database: pglite(new PGlite(DATABASE_DIR)),
  secret: TENON_SECRET,
  site: { url: TENON_SITE_URL },
  collections: {
    authors: { fields: { name: { type: "text", required: true } } },
    posts: {
      titleField: "title",
      permalink: "/posts/{slug}",
      fields: {
        title: { type: "text", required: true },
        slug: { type: "slug", from: "title", required: true, unique: true },
        author: { type: "relation", collection: "authors" },
        hero: { type: "image", image: { sizes: [480, 960] } },
        body: { type: "textarea" },
      },
    },
  },
});
