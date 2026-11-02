import { settings } from "../../presets/settings.ts";
import type { Collection, Field, Global, Schema } from "../../schema/index.ts";
import { structureFields } from "../../schema/traversal/localized-fields.ts";
import { TRANSLATIONS } from "../../content/reads/loc-of.ts";
import type { SettingsOptions } from "./options.ts";

/**
 * Create (default) site settings and add custom globals to the settings section in admin
 * @param schema The generated schema that contains the collections and globals
 * @param option Disable all or individual preset setting schemas
 * @param hasMedia Indicates whether the media fields should be included in the default site settings (e.g. favicon or social media images)
 * @param localized Localizes the default globals. A replacement is taken as is.
 * @returns The schema, and whether the built-in `translations` global was added.
 */
export function createSiteSettings(
  schema: Required<Schema>,
  option: false | SettingsOptions | undefined,
  hasMedia: boolean,
  localized = false,
) {
  if (option === false) return { schema, translations: false };

  const defaults = settings();
  const { favicon, ...general } = defaults.general.fields;
  const { image, ...seo } = defaults.seo.fields;
  const globals: Record<string, Global> = {
    general: hasMedia ? defaults.general : { ...defaults.general, fields: general },
    seo: hasMedia ? defaults.seo : { ...defaults.seo, fields: seo },
  };
  const translations = localized && option?.translations !== false && translationsGlobal(schema);
  if (translations) globals[TRANSLATIONS] = translations;

  // check if the global already exists in the schema to avoid duplicates and add custom globals to settings
  for (const name of Object.keys(globals)) {
    const chosen = option?.[name as keyof SettingsOptions];
    if (chosen === false) continue;
    if (Object.hasOwn(schema.globals, name))
      throw new Error(`tenoncms: duplicate global "${name}"`);
    schema.globals[name] =
      chosen ??
      (localized && name !== TRANSLATIONS ? { ...globals[name]!, localized } : globals[name]!);
  }

  return { schema, translations: !!translations };
}

// One switch per localized entry with lists. Its default is the entry's `syncStructure`.
function translationsGlobal(schema: Required<Schema>): Global | undefined {
  const entries: Array<[string, Collection | Global]> = [
    ...Object.entries(schema.collections),
    ...Object.entries(schema.globals),
  ];
  const fields: Record<string, Field> = {};
  for (const [name, entry] of entries) {
    if (!Object.keys(structureFields(entry)).length) continue;
    fields[name] = {
      type: "boolean",
      appearance: "switch",
      label: entry.label ?? name,
      description: {
        en: "Same content structure in all languages",
        de: "Gleiches Structure in allen Sprachen",
      },
      default: entry.syncStructure ?? true,
    };
  }
  if (!Object.keys(fields).length) return undefined;
  return {
    label: { en: "Translations", de: "Übersetzungen" },
    description: {
      en: "Whether new documents keep one structure in every language.",
      de: "Ob neue Dokumente in jeder Sprache dasselbe Structure haben.",
    },
    nav: { display: "settings", icon: "languages", order: 3 },
    drafts: false,
    fields,
  };
}
