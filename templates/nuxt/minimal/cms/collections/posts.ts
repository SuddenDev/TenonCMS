import { defineCollection } from "tenoncms";

export const posts = defineCollection({
  titleField: "title",
  permalink: "/posts/{slug}",
  fields: {
    title: { type: "text", required: true },
    slug: { type: "slug", from: "title", required: true, unique: true },
    body: { type: "textarea" },
  },
});
