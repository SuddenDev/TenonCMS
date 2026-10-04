import { settings as defaults } from "../../presets/settings.ts";
import type { Global, Schema } from "../../schema/index.ts";
import type { SettingsOption } from "./options.ts";

// Adds the settings globals. Without media, the defaults leave out their media fields.
export function addSettings(
  schema: Required<Schema>,
  option: false | SettingsOption | undefined,
  hasMedia: boolean,
) {
  if (option === false) return schema;
  const { favicon, ...general } = defaults.general.fields;
  const { image, ...seo } = defaults.seo.fields;
  const globals: Record<string, Global> = {
    general: hasMedia ? defaults.general : { ...defaults.general, fields: general },
    seo: hasMedia ? defaults.seo : { ...defaults.seo, fields: seo },
  };
  for (const name of Object.keys(globals)) {
    const chosen = option?.[name as keyof SettingsOption];
    if (chosen === false) continue;
    if (Object.hasOwn(schema.globals, name))
      throw new Error(`integral-cms: duplicate global "${name}"`);
    schema.globals[name] = chosen ?? globals[name]!;
  }
  return schema;
}
