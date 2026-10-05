import type { Fields } from "../../schema/fields/index.ts";
import type { CollectionHooks } from "../../schema/hooks/index.ts";
import type { Collection } from "./types.ts";

/**
 * Defines a collection with hook data types inferred from its fields.
 *
 * @param collection Collection configuration, including fields and optional hooks, that can also be ommitted.
 * @returns A shallow copy with an empty hooks object when hooks are omitted.
 */
export function defineCollection<
  const F extends Fields,
  const T extends Omit<Collection<F>, "fields" | "hooks">,
  const H extends CollectionHooks<NoInfer<F>>,
>(collection: T & { fields: F; hooks?: H }): T & { fields: F; hooks: H } {
  return { ...collection, hooks: collection.hooks ?? ({} as H) };
}
