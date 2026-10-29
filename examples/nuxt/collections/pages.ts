import { defineCollection } from "tenoncms";
import { page, seo } from "tenoncms/presets";

export const pages = defineCollection({
  label: "Pages",
  localized: true,
  titleField: "title",
  fields: { ...page.fields, ...seo.fields, body: { type: "textarea" } },
  hooks: page.hooks,
  permalink: page.permalink,
});
