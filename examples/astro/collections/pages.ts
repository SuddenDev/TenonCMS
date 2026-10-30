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
    // Shared blocks from `blocks` in tenon.config.ts.
    content: { type: "blocks", blocks: ["hero", "text", "section"] },
  },
  hooks: page.hooks,
  permalink: page.permalink,
});
