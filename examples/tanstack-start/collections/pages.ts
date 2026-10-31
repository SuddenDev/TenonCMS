import { defineCollection } from "tenoncms";
import { page, seo } from "tenoncms/presets";

const preset = page();

export const pages = defineCollection({
  label: "Pages",
  titleField: "title",
  fields: { ...preset.fields, ...seo().fields, body: { type: "textarea" } },
  hooks: preset.hooks,
  permalink: preset.permalink,
});
