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
          fullTitle: {
            type: "boolean",
            appearance: "switch",
            label: { en: "Use as the full title", de: "Als vollständigen Titel verwenden" },
            description: {
              en: "Off: the title fills {title} in the title template, like {title} · {site.title}. On: it shows as is.",
              de: "Aus: Der Titel füllt {title} in der Titelvorlage, z. B. {title} · {site.title}. An: Er erscheint unverändert.",
            },
            condition: { title: { exists: true } },
          },
          description: { type: "textarea", description: placeholders },
          image: {
            type: "image",
            separator: { en: "Social", de: "Social Media" },
            label: { en: "Share image", de: "Vorschaubild zum Teilen" },
            description: {
              en: "Shows when the page is shared, e.g. on LinkedIn, Facebook or in messengers. Recommended size: 1200×630. Empty uses the site's image.",
              de: "Erscheint, wenn die Seite geteilt wird, z. B. auf LinkedIn, Facebook oder in Messengern. Empfohlene Größe: 1200×630. Leer nutzt das Bild der Website.",
            },
          },
          noindex: {
            type: "boolean",
            appearance: "switch",
            label: { en: "Hide from search engines", de: "Vor Suchmaschinen verbergen" },
          },
        },
      },
    },
  } as const satisfies { fields: Fields };
}
