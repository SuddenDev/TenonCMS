// Presets run in browser bundles too, so this file MUST NOT import zod or server code.
import type { Text } from "../admin/index.d.ts";
import type { Global } from "../schema/index.ts";

/** The text in every locale, or per locale. A locale without an entry gets the first one. */
export type StringDefault = string | Readonly<Record<string, string>>;

/** A key's default text, or its default with options. */
export type StringEntry =
  | StringDefault
  | {
      /** The field label in the admin. Defaults to the key. */
      label?: Text;
      /** The text in every locale, or per locale. */
      default: StringDefault;
    };

const textFor = (value: StringDefault, locale?: string) =>
  typeof value === "string" ? value : ((locale && value[locale]) ?? Object.values(value)[0]);

// A record with a `default` key is the options form, so no locale MAY be named `default`.
const optionsOf = (entry: StringEntry) =>
  typeof entry === "object" && "default" in entry
    ? (entry as { label?: Text; default: StringDefault })
    : { default: entry as StringDefault };

/**
 * A localized global for the short texts a site hardcodes, such as a "Read more" button. Each key becomes a text
 * field editors translate on the Settings page. A read returns the stored text, else the code default of the
 * read's locale, so a site can read it before anything is saved:
 * `(await cms.getGlobal("strings", { locale, fallback: false })).readMore`.
 *
 * A text equal to its code default is stored as `null`, so a later change of a code default reaches every
 * locale that did not change that text. Read the global once per page and pass it down.
 * @param entries The text of each key, for every locale or per locale, or `{ label, default }`.
 */
export function strings<const D extends Record<string, StringEntry>>(entries: D) {
  const fields = {} as { [K in keyof D]: { type: "text"; label: Text; placeholder: string } };
  for (const key in entries) {
    const { label, default: value } = optionsOf(entries[key]);
    fields[key] = {
      type: "text",
      label: label ?? key,
      placeholder: textFor(value),
      hooks: {
        // The admin form sends the defaults it shows. Storing them would hide a later change of the code default.
        beforeChange: {
          dropDefault: ({ value: input, locale }: { value?: string | null; locale?: string }) =>
            input === textFor(value, locale) ? null : input,
        },
        // ponytail: with `fallback`, a text stored in the default locale wins over another locale's code default;
        // read with `fallback: false` when defaults differ per locale.
        afterRead: {
          codeDefault: ({ value: stored, locale }: { value?: string | null; locale?: string }) =>
            stored || textFor(value, locale),
        },
      },
    } as (typeof fields)[typeof key];
  }

  return {
    label: { en: "Strings", de: "Texte" },
    description: {
      en: "Short texts of the site, such as button labels.",
      de: "Kurze Texte der Website, etwa Beschriftungen von Buttons.",
    },
    localized: true,
    nav: { display: "settings", icon: "languages" },
    fields,
  } as const satisfies Global;
}

/**
 * `strings(entries)` as a global for `defineCms({ presets })`.
 * @param options.name The global name. Default `'strings'`.
 */
export function stringsPreset<
  const D extends Record<string, StringEntry>,
  const N extends string = "strings",
>(entries: D, { name = "strings" as N }: { name?: N } = {}) {
  return {
    globals: { [name]: strings(entries) } as { [K in NoInfer<N>]: ReturnType<typeof strings<D>> },
  };
}
