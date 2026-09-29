import { defineCollection } from "integral-cms";

export const authors = defineCollection({
  label: "Authors",
  group: "Blog",
  icon: "users",
  titleField: "name",
  fields: {
    name: { type: "text", required: true },
    posts: { type: "join", collection: "posts", on: "author", label: "Posts" },
  },
});
