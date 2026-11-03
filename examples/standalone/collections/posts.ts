import { titleDescription } from "./posts.client";
import { defineCollection } from "tenoncms";

export const posts = defineCollection({
  label: "Posts",
  titleField: "title",
  fields: {
    title: { type: "text", required: true, description: titleDescription },
    slug: { type: "slug", from: "title", required: true, unique: true },
    publishedAt: { type: "date", label: "Published at" },
    hero: { type: "image", folder: "posts" },
    body: { type: "textarea" },
    links: {
      type: "array",
      itemLabels: { singular: "Link", plural: "Links" },
      fields: {
        label: { type: "text", required: true },
        url: { type: "text" },
      },
    },
  },
});
