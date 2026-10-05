import type { Collection } from "../../collections/config/types.ts";
import type { Global } from "../../globals/config/types.ts";

/** The collections and globals of an instance. */
export type Schema = {
  collections?: Record<string, Collection>;
  globals?: Record<string, Global>;
};
