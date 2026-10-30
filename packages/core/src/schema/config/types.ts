import type { Collection } from "../../collections/config/types.ts";
import type { Global } from "../../globals/config/types.ts";
import type { Block } from "../fields/index.ts";

/** The collections, globals and shared blocks of an instance. */
export type Schema = {
  collections?: Record<string, Collection>;
  globals?: Record<string, Global>;
  blocks?: Record<string, Block>;
};
