import { defineCollection, ValidationError } from "integral-cms";

const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

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
      type: "text",
      required: false,
      pattern: "[a-z0-9]+(-[a-z0-9]+)*",
      unique: true,
      description: "Lowercase letters, digits and dashes. Filled from the title when empty.",
      // Runs before validation, so an empty slug is filled from the title instead of failing `required`.
      hooks: {
        beforeValidate: [
          ({ value, siblingData }) =>
            value || slugify(String(siblingData.title ?? "")),
        ],
      },
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
    beforeChange: {
      featuredNeedsAuthor: ({ data }) => {
        if (data.featured && !data.author)
          throw new ValidationError({ author: "Featured posts need an author" });
      },
    },
  },
});
