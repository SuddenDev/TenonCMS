import { requireRef } from "../../admin/describe/registration-checks.ts";
import type { Plugin } from "../../plugins/types.ts";
import { RICHTEXT_FEATURES, richtextSchema } from "../runtime/extensions.ts";
import type { RichtextOptions, RichtextRegistration } from "./types.ts";

/**
 * Combines the rich text extensions of the plugins, in plugin order, then the host's.
 * @returns The registrations by feature name, in a null-prototype object.
 * @throws If a name is used twice or is a built-in feature, a registration lacks a `schema` or a `clientRef()`, or
 * the extensions clash in one Tiptap schema.
 */
export function mergeRichtext(
  plugins: readonly Plugin[],
  host: RichtextOptions = {},
): Record<string, RichtextRegistration> {
  const merged: Record<string, RichtextRegistration> = Object.create(null);
  const sources: Array<[string, RichtextOptions | undefined]> = [
    ...plugins.map((p): [string, RichtextOptions | undefined] => [
      `plugin "${p.name}"`,
      p.richtext,
    ]),
    ["tenon.config.ts", host],
  ];

  for (const [source, options] of sources)
    for (const [name, registration] of Object.entries(options?.extensions ?? {})) {
      if (Object.hasOwn(merged, name) || (RICHTEXT_FEATURES as readonly string[]).includes(name))
        throw new Error(`tenoncms: duplicate rich text feature "${name}"`);
      requireRef(registration.client, `richtext.extensions.${name}.client`, source);
      if (!registration.schema)
        throw new Error(`tenoncms: rich text feature "${name}" needs a schema`);
      merged[name] = registration;
    }

  if (Object.keys(merged).length)
    richtextSchema({ allowed: [...RICHTEXT_FEATURES, ...Object.keys(merged)] }, merged);
  return merged;
}
