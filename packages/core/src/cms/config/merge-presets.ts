import type { Schema } from "../../schema/index.ts";
import type { Preset } from "./options.ts";

const kinds = { collections: "collection", globals: "global", blocks: "block" } as const;

/**
 * Adds the collections, globals and blocks of all presets to the host's schema.
 * @returns A new schema. The host's entries come first.
 * @throws If a name is already taken. Two unlimited menus share their blocks, so a block defined the same way is not.
 */
export function mergePresets(presets: readonly Preset[], schema: Schema): Schema {
  const merged: Required<Preset> = {
    collections: { ...schema.collections },
    globals: { ...schema.globals },
    blocks: { ...schema.blocks },
  };

  for (const preset of presets) {
    for (const kind of Object.keys(kinds) as (keyof typeof kinds)[]) {
      const entries: Record<string, unknown> = merged[kind];
      for (const [name, entry] of Object.entries(preset[kind] ?? {})) {
        // ponytail: JSON skips functions, so blocks that differ only in a `validate` count as the same.
        const same = kind === "blocks" && JSON.stringify(entries[name]) === JSON.stringify(entry);
        if (Object.hasOwn(entries, name) && !same)
          throw new Error(`tenoncms: duplicate ${kinds[kind]} "${name}"`);
        entries[name] = entry;
      }
    }
  }

  return merged;
}
