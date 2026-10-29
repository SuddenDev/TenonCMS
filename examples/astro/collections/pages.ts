import { defineCollection } from "tenoncms";
import { page, seo } from "tenoncms/presets";

export const pages = defineCollection({
  label: { en: "Pages", de: "Seiten" },
  localized: true,
  titleField: "title",
  fields: {
    ...page.fields,
    ...seo.fields,
    body: { type: "textarea" },
    hero: { label: { en: "Hero Image" }, type: "image" },
    content: {
      type: "blocks",
      blocks: {
        hero: {
          label: "Hero",
          icon: "image",
          fields: { title: { type: "text" }, image: { type: "image" } },
        },
        text: { label: "Text", icon: "type", fields: { body: { type: "textarea" } } },
      },
    },
  },
  hooks: page.hooks,
  permalink: page.permalink,
});
