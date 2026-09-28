import type { Common } from "./common.ts";

// Not stored, so it has no validator; `dataSchema()` skips it.
export type JoinField = Common & {
  /** Not stored. Lists the documents of `collection` whose relation at `on` points here. Only in collections, at the top level. */
  type: "join";
  /** Name of the collection whose documents point here. */
  collection: string;
  /** Path of the relation field in `collection` that points here, e.g. `author` or `seo.image`. */
  on: string;
  required?: never;
};
