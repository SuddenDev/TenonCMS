import type { SelectSpec } from "../../content/population/select-fields.ts";
import { treeOf } from "./path-tree.ts";

/**
 * Parses `?select=`: dot paths, comma-separated. It does not check keys; `badSelectPath()` does.
 * @returns The selection tree.
 */
export function parseSelect(query: string): SelectSpec {
  return treeOf(query.split(",").filter(Boolean));
}
