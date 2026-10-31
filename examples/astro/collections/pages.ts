import { defineCollection } from "tenoncms";
import { page, seo } from "tenoncms/presets";

const presetPreset = page();

export const pages = defineCollection({
  label: { en: "Pages", de: "Seiten" },
  localized: true,
  titleField: "title",
  fields: {
    ...presetPreset.fields,
    ...seo().fields,
    body: { type: "textarea" },
    hero: { label: { en: "Hero Image" }, type: "image" },
    // Shared blocks from `blocks` in tenon.config.ts.
    content: { type: "blocks", blocks: ["hero", "text", "section"] },
  },
  hooks: presetPreset.hooks,
  permalink: presetPreset.permalink,
});
