import type { Fields } from "../fields/index.ts";
import type { CollectionHooks } from "./collection.ts";

/** Hooks of a global. Same as {@link CollectionHooks}; `docs` holds the one global. */
export type GlobalHooks<F extends Fields> = Pick<
  CollectionHooks<F>,
  "beforeValidate" | "beforeChange" | "afterChange" | "beforeRead" | "afterRead"
>;
