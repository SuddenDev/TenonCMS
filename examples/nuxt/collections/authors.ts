import { defineCollection } from "integral-cms";

export const authors = defineCollection({
  label: "Authors",
  titleField: "name",
  fields: {
    name: { type: "text", required: true },
    posts: { type: "join", collection: "posts", on: "author", label: "Posts" },
  },
});
