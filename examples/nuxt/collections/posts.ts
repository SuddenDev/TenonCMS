import { defineCollection, ValidationError } from "integral-cms";

export const posts = defineCollection({
  label: "Posts",
  titleField: "title",
  preview: "/posts/{slug}",
  fields: {
    title: {
      type: "text",
      required: true,
      placeholder: "Title",
      maxLength: 120,
      hooks: { beforeChange: [({ value }) => value?.trim()] },
    },
    slug: {
      type: "slug",
      from: "title",
      required: true,
      unique: true,
      description: "Lowercase letters, digits and dashes. Filled from the title when empty.",
    },
    author: { type: "relation", collection: "authors", label: "Author" },
    publishedAt: { type: "date", label: "Published at" },
    category: { type: "select", options: ["news", "guide"], default: "news" },
    featured: { type: "boolean" },
    featuredNote: {
      type: "text",
      label: "Featured note",
      required: true,
      condition: { featured: true },
    },
    hero: { type: "image", folder: "posts", image: { sizes: [480, 960, 1440] } },
    body: { type: "textarea" },
  },
  hooks: {
    beforeChange: {
      featuredNeedsAuthor: ({ data }) => {
        if (data.featured && !data.author)
          throw new ValidationError({ author: "Featured posts need an author" });
      },
    },
  },
});
