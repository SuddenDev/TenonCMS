import type { Fields } from "../../schema/fields/index.ts";
import type { CollectionHooks } from "../../schema/hooks/index.ts";
import type { Collection } from "./types.ts";

// `H` keeps the literal hooks, so a host can leave one hook of a record out by name.
export function defineCollection<
  const F extends Fields,
  const T extends Omit<Collection<F>, "fields" | "hooks">,
  const H extends CollectionHooks<NoInfer<F>>,
>(collection: T & { fields: F; hooks?: H }): T & { fields: F; hooks: H } {
  return { ...collection, hooks: collection.hooks ?? ({} as H) };
}
