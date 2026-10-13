import { defineCollection } from "integral-cms";

export const posts = defineCollection({
  label: "Posts",
  titleField: "title",
  permalink: "/posts/{slug}",
  fields: {
    title: { type: "text", required: true },
    slug: { type: "text", required: true },
    publishedAt: { type: "date", label: "Published at" },
    category: { type: "select", options: ["news", "guide"] },
    featured: { type: "boolean" },
    body: { type: "textarea" },
  },
});
