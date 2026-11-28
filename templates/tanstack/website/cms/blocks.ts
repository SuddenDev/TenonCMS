import type { Block } from "tenoncms";

// The sections a page is built from. Each block has a component of the same name in src/blocks/.

export const hero = {
  label: "Hero",
  description: "A big title, a short intro and up to two links",
  icon: "heading",
  fields: {
    title: { type: "text", required: true },
    intro: { type: "textarea" },
    links: {
      type: "array",
      maxRows: 2,
      itemLabels: { singular: "Link", plural: "Links" },
      fields: { label: { type: "text" }, link: { type: "link", required: true } },
    },
  },
} as const satisfies Block;

export const image = {
  label: "Image",
  description: "A wide image with a caption",
  icon: "image",
  fields: { image: { type: "image", required: true }, caption: { type: "text" } },
} as const satisfies Block;

export const text = {
  label: "Text",
  description: "Rich text with an optional title",
  icon: "type",
  fields: { title: { type: "text" }, body: { type: "richtext", required: true } },
} as const satisfies Block;

export const list = {
  label: "List",
  description: "A title and a list of short rows",
  icon: "list",
  fields: {
    title: { type: "text" },
    intro: { type: "textarea" },
    items: {
      type: "array",
      itemLabels: { singular: "Row", plural: "Rows" },
      fields: {
        title: { type: "text", required: true },
        text: { type: "textarea" },
        note: { type: "text" },
      },
    },
  },
} as const satisfies Block;

export const blocks = { hero, image, text, list };
