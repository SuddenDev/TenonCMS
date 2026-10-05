import type { Core } from "../../cms/runtime/types.ts";
import { distinctValues } from "../../db/queries/media/distinct-values.query.ts";

/** All folders of the library with their parents, sorted. The root `''` is left out. */
export async function folders(core: Core) {
  const set = new Set<string>();
  for (const folder of await distinctValues(await core.db(), "media", "folder")) {
    const parts = String(folder ?? "").split("/");
    for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join("/"));
  }
  set.delete("");
  return [...set].sort();
}
