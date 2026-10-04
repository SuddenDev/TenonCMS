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
 */
export async function onDelete(
  db: Kysely<Database>,
  schema: Schema,
  collection: string,
  id: string,
  effects: Effects,
) {
  const refs = await references(db, schema, collection, id);
  // `image` and `file` restrict by default; relations only when required.
  const rule = (r: Ref) =>
    r.field.onDelete ?? (r.field.required || r.field.type !== "relation" ? "restrict" : "set-null");
  const blocking = refs.filter((r) => rule(r) === "restrict");
  if (blocking.length) {
    const owners = new Map(blocking.map((r) => [owner(r), r])).values();
    throw new ConflictError(
      [...owners].map((r) =>
        r.global ? { global: r.global } : { collection: r.collection!, id: r.id! },
      ),
    );
  }
  // `set-null` runs before `cascade`: the scanned data is still current then.
  const cleared = refs.filter((r) => rule(r) === "set-null");
  for (const r of cleared) {
    const parent = r.path.slice(0, -1).reduce<any>((o, k) => o?.[k], r.data);
    const key = r.path.at(-1)!;
    parent[key] = r.field.many ? parent[key].filter((x: string) => x !== id) : null;
  }
  for (const r of new Map(cleared.map((r) => [owner(r), r])).values()) {
    if (r.global) await effects.setGlobal(r.global, r.data);
    else await effects.update(r.collection!, r.id!, r.data);
  }
  // Globals cannot cascade (checked at startup), so `collection` and `id` are set.
  for (const r of refs.filter((r) => rule(r) === "cascade"))
    await effects.delete(r.collection!, r.id!);
}
