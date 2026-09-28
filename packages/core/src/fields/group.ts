import type { Base } from "./common.ts";
import type { Fields } from "./index.ts";

// A group's validator is built by `dataSchema()` from its fields, because conditions inside depend on the data.
export type GroupField = Base<Record<string, unknown>> & {
  /** Nests fields under one key, stored as an object. The admin shows it as its own section. Not filterable. */
  type: "group";
  /** The nested fields. Groups MAY contain groups. */
  fields: Fields;
};
