import { defineCollection } from "integral-cms";

export const posts = defineCollection({
  label: "Posts",
  titleField: "title",
  fields: {
    title: { type: "text", required: true },
    slug: { type: "slug", from: "title", required: true, unique: true },
    publishedAt: { type: "date", label: "Published at" },
    body: { type: "textarea" },
  },
});
