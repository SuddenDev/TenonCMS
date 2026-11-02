// Presets run in browser bundles too, so this file MUST NOT import zod or server code.
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
        separator: {
          type: "text",
          default: " · ",
          description: {
            en: "Text between the page title and the site title.",
            de: "Text zwischen dem Seitentitel und dem Titel der Website.",
          },
        },
        description: {
          type: "textarea",
          description: {
            en: "Fallback description for pages without their own.",
            de: "Standardbeschreibung für Seiten ohne eigene.",
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
