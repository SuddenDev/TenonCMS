import type { SeoTemplates } from "../helpers/seo-meta.ts";
import type { Fields } from "../schema/index.ts";

const placeholders = {
  en: "Empty uses the default. Placeholders like {title} or {site.title} fill in on the site.",
  de: "Leer nutzt den Standard. Platzhalter wie {title} oder {site.title} werden auf der Website gefüllt.",
};

/**
 * SEO fields in one optional group, with the admin's SEO editor. Read them with `seoMeta()` from `tenoncms` or
 * `tenoncms/client`.
 * @param templates Title and description of documents without their own, with placeholders like `{title}`. They win
 * over the site's `seo` global. Pass them to `seoMeta()` as `templates` too.
 */
export function seo<const T extends SeoTemplates = {}>(templates: T = {} as T) {
  return {
    fields: {
      seo: {
        type: "group",
        label: { en: "SEO", de: "SEO" },
        editor: "seo",
        templates,
        fields: {
          title: { type: "text", description: placeholders },
          description: { type: "textarea", description: placeholders },
          image: { type: "image" },
          noindex: {
            type: "boolean",
            label: { en: "Hide from search engines", de: "Vor Suchmaschinen verbergen" },
          },
        },
      },
    },
  } as const satisfies { fields: Fields };
}
