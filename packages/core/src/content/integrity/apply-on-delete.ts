import { type Database } from "../../db/types.ts";
import { type Schema } from "../../schema/index.ts";
import { ConflictError } from "../../errors.ts";
import { type Ref, owner, references } from "./find-references.ts";
import type { Kysely } from "kysely";

/** Local API calls of the current operation, with all their hooks. */
export type Effects = {
  update(collection: string, id: string, data: Record<string, unknown>): Promise<unknown>;
  setGlobal(name: string, data: Record<string, unknown>): Promise<unknown>;
  delete(collection: string, id: string): Promise<unknown>;
};

/**
 * Applies `onDelete` to every reference to a deleted document. MUST run in the delete's transaction, after the row is gone,
 * so a cascade that comes back to it finds nothing and cycles end.
 *
 * @throws {ConflictError} When a `restrict` reference points to the document. Nothing is changed then.
 */
export async function onDelete(
  db: Kysely<Database>,
  schema: Schema,
  collection: string,
  id: string,
  effects: Effects,
) {
  const refs = await references(db, schema, collection, id);

  const blocking = refs.filter((r) => rule(r) === "restrict");
  if (blocking.length) throw conflict(blocking);

  // `set-null` runs before `cascade`: the scanned data is still current then.
  const cleared = refs.filter((r) => rule(r) === "set-null");
  await clear(cleared, id, effects);

  // Globals cannot cascade (checked at startup), so `collection` and `id` are set.
  for (const r of refs.filter((r) => rule(r) === "cascade"))
    await effects.delete(r.collection!, r.id!);
}

// `image` and `file` restrict by default; relations only when required.
function rule(r: Ref) {
  return (
    r.field.onDelete ?? (r.field.required || r.field.type !== "relation" ? "restrict" : "set-null")
  );
}

function conflict(blocking: Ref[]) {
  const owners = new Map(blocking.map((r) => [owner(r), r])).values();
  return new ConflictError(
    [...owners].map((r) =>
      r.global ? { global: r.global } : { collection: r.collection!, id: r.id! },
    ),
  );
}

// References of one owner share one `data` object, so each owner is written once with all its edits.
async function clear(refs: Ref[], id: string, effects: Effects) {
  for (const r of refs) {
    const parent = r.path.slice(0, -1).reduce<any>((o, k) => o?.[k], r.data);
    const key = r.path.at(-1)!;
    parent[key] = r.field.many ? parent[key].filter((x: string) => x !== id) : null;
  }

  for (const r of new Map(refs.map((r) => [owner(r), r])).values()) {
    if (r.global) await effects.setGlobal(r.global, r.data);
    else await effects.update(r.collection!, r.id!, r.data);
  }
}
