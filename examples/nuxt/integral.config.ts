import { defineCms } from "integral-cms";
import { pages } from "./collections/pages";
import { posts } from "./collections/posts";
import { authors } from "./collections/authors";

const { cmsSecret, databaseUrl } = useRuntimeConfig();

export default defineCms({
  collections: { authors, posts, pages },
  globals: {
    site: {
      label: "Site settings",
      fields: {
        title: { type: "text", required: true },
        tagline: { type: "text" },
      },
    },
  },
  database: { url: databaseUrl },
  secret: cmsSecret,
});
