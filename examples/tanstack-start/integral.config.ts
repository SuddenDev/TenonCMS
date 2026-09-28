import { defineCms } from "integral-cms";
import { pages } from "./collections/pages";
import { posts } from "./collections/posts";

export default defineCms({
  collections: { posts, pages },
  globals: {
    site: {
      label: "Site settings",
      fields: {
        title: { type: "text", required: true },
        tagline: { type: "text" },
      },
    },
  },
  database: { url: process.env.DATABASE_URL ?? "file:./cms.db" },
  secret: process.env.CMS_SECRET!,
});
