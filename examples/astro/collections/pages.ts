import { defineCollection } from "integral-cms";
import { page, seo } from "integral-cms/presets";

export const pages = defineCollection({
  label: "Pages",
  localized: true,
  titleField: "title",
  fields: {
    ...page.fields,
    ...seo.fields,
    body: { type: "textarea" },
    hero: { type: "image" },
  },
  hooks: page.hooks,
  permalink: page.permalink,
});
