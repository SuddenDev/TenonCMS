import type { Storage } from "../storage/types.ts";

// Variants live under `.variants/<key>/<modifier id>`, so one list call finds the variants of a file.

export const VARIANTS = ".variants/";

/** Where the variant `id` (a modifier id) of the file `key` lives. */
export const variantKey = (key: string, id: string) => `${VARIANTS}${key}/${id}`;

/** The modifier ids of the stored variants of `key`. Deeper keys belong to files in a folder named like `key`. */
export async function variantsOf(storage: Storage, key: string) {
  const prefix = `${VARIANTS}${key}/`;
  return (await storage.list(prefix))
    .map((k) => k.slice(prefix.length))
    .filter((id) => !id.includes("/"));
}
