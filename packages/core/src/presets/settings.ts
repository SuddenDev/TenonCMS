// Presets run in browser bundles too, so this file MUST NOT import zod or server code.
import { DEFAULT_SEO_TITLE } from "../helpers/seo-meta.ts";
import type { Global } from "../schema/index.ts";

/**
 * The default settings globals. `defineCms()` adds both unless the `settings` option says otherwise.
 * Spread one to extend it: `{ ...general, fields: { ...general.fields, analyticsId: { type: 'text' } } }`.
 */
export function settings() {
  return {
    general: {
      label: { en: "General", de: "Allgemein" },
      description: {
        en: "Site title, tagline, URL and favicon.",
        de: "Titel, Untertitel, URL und Favicon der Website.",
      },
      nav: { display: "settings", icon: "settings", order: 1 },
      fields: {
        title: {
          type: "text",
          required: true,
          description: { en: "Name of the site.", de: "Name der Website." },
        },
        tagline: {
          type: "text",
          description: {
            en: "Short line that describes the site.",
            de: "Kurze Zeile, die die Website beschreibt.",
          },
        },
        url: {
          type: "text",
          pattern: "https?://\\S+",
          description: {
            en: "Site URL, used for canonical and social links.",
            de: "URL der Website, für kanonische Links und soziale Netzwerke.",
          },
        },
        favicon: {
          type: "image",
          description: { en: "Icon shown in browser tabs.", de: "Symbol in den Browser-Tabs." },
        },
      },
    } as const satisfies Global,
    seo: {
      label: { en: "SEO", de: "SEO" },
      description: {
        en: "Search and social defaults for every page.",
        de: "Standards für Suchmaschinen und soziale Netzwerke auf jeder Seite.",
      },
      nav: { display: "settings", icon: "search", order: 2 },
      fields: {
        title: {
          type: "text",
          placeholder: DEFAULT_SEO_TITLE,
          description: {
            en: "Title of pages without their own. {title} is the page title, {site.title} and {site.tagline} come from General, and {field} reads any field of the page.",
            de: "Titel für Seiten ohne eigenen. {title} ist der Seitentitel, {site.title} und {site.tagline} kommen aus Allgemein, und {feld} liest ein beliebiges Feld der Seite.",
          },
        },
        description: {
          type: "textarea",
          description: {
            en: "Description of pages without their own. Takes the same placeholders as the title, like {excerpt}.",
            de: "Beschreibung für Seiten ohne eigene. Nimmt dieselben Platzhalter wie der Titel, etwa {excerpt}.",
          },
        },
        image: {
          type: "image",
          description: {
            en: "Fallback social image. Recommended size: 1200×630.",
            de: "Standardbild für soziale Netzwerke. Empfohlene Größe: 1200×630.",
          },
        },
        verification: {
          type: "group",
          label: { en: "Verification", de: "Verifizierung" },
          description: {
            en: "Codes that prove you own the site.",
            de: "Codes, die den Besitz der Website bestätigen.",
          },
          fields: {
            google: {
              type: "text",
              description: {
                en: "Google Search Console verification code.",
                de: "Verifizierungscode der Google Search Console.",
              },
            },
            bing: {
              type: "text",
              description: {
                en: "Bing Webmaster Tools verification code.",
                de: "Verifizierungscode der Bing Webmaster Tools.",
              },
            },
          },
        },
        noindex: {
          type: "boolean",
          appearance: "switch",
          label: { en: "Hide from search engines", de: "Vor Suchmaschinen verbergen" },
          description: {
            en: "Ask search engines not to index any page.",
            de: "Suchmaschinen bitten, keine Seite zu indexieren.",
          },
        },
      },
    } as const satisfies Global,
  };
}
