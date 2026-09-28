import type { Fields } from "../schema/index.ts";

/** SEO fields in one optional group. Read them with `seoMeta()` from `integral-cms` or `integral-cms/client`. */
export const seo = {
  fields: {
    seo: {
      type: "group",
      label: "SEO",
      fields: {
        title: { type: "text" },
        description: { type: "textarea" },
        noindex: { type: "boolean", label: "Hide from search engines" },
      },
    },
  },
} as const satisfies { fields: Fields };
