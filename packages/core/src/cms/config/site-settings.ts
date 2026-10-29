import { settings as defaults } from "../../presets/settings.ts";
import type { Global, Schema } from "../../schema/index.ts";
import type { SettingsOptions } from "./options.ts";

/**
 * Create (default) site settings and add custom globals to the settings section in admin
 * @param schema The generated schema that contains the collections and globals
 * @param option Disable all or individual preset setting schemas
 * @param hasMedia Indicates whether the media fields should be included in the default site settings (e.g. favicon or social media images)
 * @param localized Localizes the default globals. A replacement is taken as is.
 * @returns
 */
export function createSiteSettings(
  schema: Required<Schema>,
  option: false | SettingsOptions | undefined,
  hasMedia: boolean,
  localized = false,
) {
  if (option === false) return schema;

  const { favicon, ...general } = defaults.general.fields;
  const { image, ...seo } = defaults.seo.fields;
  const globals: Record<string, Global> = {
    general: hasMedia ? defaults.general : { ...defaults.general, fields: general },
    seo: hasMedia ? defaults.seo : { ...defaults.seo, fields: seo },
  };

  // check if the global already exists in the schema to avoid duplicates and add custom globals to settings
  for (const name of Object.keys(globals)) {
    const chosen = option?.[name as keyof SettingsOptions];
    if (chosen === false) continue;
    if (Object.hasOwn(schema.globals, name))
      throw new Error(`tenoncms: duplicate global "${name}"`);
    schema.globals[name] =
      chosen ?? (localized ? { ...globals[name]!, localized } : globals[name]!);
  }

  return schema;
}
