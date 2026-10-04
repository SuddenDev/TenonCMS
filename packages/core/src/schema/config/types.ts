import type { Collection } from "../../collections/config/types.ts";
import type { Global } from "../../globals/config/types.ts";

export type Schema = {
  collections?: Record<string, Collection>;
  globals?: Record<string, Global>;
};
