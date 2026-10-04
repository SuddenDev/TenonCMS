import type { SelectSpec } from "../../content/population/select-fields.ts";
import { treeOf } from "./path-tree.ts";

/** Parses `?select=`: dot paths, comma-separated. Keys are checked by `badSelectPath()`. */
export function parseSelect(query: string): SelectSpec {
  return treeOf(query.split(",").filter(Boolean));
}
