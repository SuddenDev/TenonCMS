import type { Core, Scope } from "../../cms/runtime/types.ts";
import { collectionTarget } from "../../content/targets.ts";
import { distinctValues } from "../../db/queries/media/distinct-values.query.ts";
import { readAccess } from "../../access/read.ts";

/**
 * The folders of the files the caller of `scope` MAY read, with their parents, sorted. The root `''` is left out.
 * @returns The folder paths.
 * @throws {ForbiddenError} When `media.access.read` denies.
 */
export async function folders(core: Core, scope: Scope) {
  const access = await readAccess(core, scope, collectionTarget("media"));
  const where = access === true ? {} : access;
  const set = new Set<string>();

  for (const folder of await distinctValues(await core.db(), "media", "folder", where)) {
    const parts = String(folder ?? "").split("/");
    for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join("/"));
  }
  set.delete("");

  return [...set].sort();
}
