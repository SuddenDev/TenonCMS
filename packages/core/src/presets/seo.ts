import type { Fields } from "../schema/index.ts";

/** SEO fields in one optional group. Read them with `seoMeta()` from `tenoncms` or `tenoncms/client`. */
export const seo = {
  fields: {
    seo: {
      type: "group",
      label: { en: "SEO", de: "SEO" },
      fields: {
        title: { type: "text" },
        description: { type: "textarea" },
        image: { type: "image" },
        noindex: {
          type: "boolean",
          label: { en: "Hide from search engines", de: "Vor Suchmaschinen verbergen" },
        },
      },
    },
  },
} as const satisfies { fields: Fields };
