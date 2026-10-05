import type { Storage } from "../storage/types.ts";
import { VARIANTS } from "./keys.ts";

/** Deletes every variant whose file is not in `keys`, and returns how many. */
export async function removeOrphans(storage: Storage, keys: string[]) {
  const known = new Set(keys);
  const fileOf = (variant: string) => variant.slice(VARIANTS.length, variant.lastIndexOf("/"));

  // ponytail: lists every variant in one go. Page through storage if a library outgrows memory.
  const orphans = (await storage.list(VARIANTS)).filter((variant) => !known.has(fileOf(variant)));
  for (const variant of orphans) await storage.delete(variant);
  return orphans.length;
}
