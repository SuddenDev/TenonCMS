import { defineCollection, ValidationError } from "integral-cms";
import { page } from "integral-cms/presets";

export const posts = defineCollection({
  label: "Posts",
  titleField: "title",
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
    color: { type: "custom:color", label: "Accent color" },
    body: { type: "textarea" },
  },
  hooks: {
    // Runs before validation, so API writes MAY leave the slug empty.
    beforeValidate: {
      slugFromTitle: page.hooks.beforeValidate.slugFromTitle,
    },
    beforeChange: {
      featuredNeedsAuthor: ({ data }) => {
        if (data.featured && !data.author)
          throw new ValidationError({ author: "Featured posts need an author" });
      },
    },
  },
});
