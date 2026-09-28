import type { Kysely } from "kysely";
import { isObject } from "./condition.ts";
import { byIds, joinedDocs } from "./db/documents.ts";
import { type Database, toDoc } from "./db/index.ts";
import { innerFields, mapValue, relationPaths } from "./walk.ts";
import type { Collection, Field, Fields } from "./schema.ts";

/** `false`: ids. Number: hops left. Object: listed paths only; `true` inside means one hop. */
export type Spec = false | number | { [key: string]: true | Spec };

/** Keys a read returns. `true` keeps the value; an object lists keys inside a group or a resolved relation or join. */
export type SelectSpec = { [key: string]: true | SelectSpec };

type Docs = Record<string, any>[];
type Collections = Record<string, Collection>;

/** The populate spec of read options: `populate: false`, a populate object, or `depth` hops (default `depth`). */
export function toSpec(
  options: { populate?: boolean | object; depth?: number },
  depth: number,
): Spec {
  return options.populate === false
    ? false
    : typeof options.populate === "object"
      ? (options.populate as Spec)
      : (options.depth ?? depth);
}

/**
 * What `key` gets under `spec`: whether its value resolves at all (`on`), and the spec its value continues with (`child`).
 * A group passes the spec through, one hop at least. A join resolves only when a populate object names it.
 * The type-level twins are `Sub` and `Next` in `types.ts`.
 */
export function step(
  spec: Spec | true,
  key: string,
  field: Field,
): { on: boolean; child: Spec | true } {
  const sub: Spec | true = typeof spec === "object" ? (spec[key] ?? false) : spec;
  if (field.type === "group") return { on: Boolean(sub), child: sub === true ? 1 : sub };
  if (field.type === "join" && typeof spec !== "object") return { on: false, child: false };
  if (sub === true) return { on: true, child: false };
  if (typeof sub === "number") return { on: sub > 0, child: sub - 1 };
  return { on: Boolean(sub), child: sub };
}

/** Read hooks of the target collection. They get the loaded documents per field per hop, and MAY replace them. */
export type ReadHooks = {
  before(collection: string, docs: Docs): Promise<Docs>;
  after(collection: string, docs: Docs): Promise<Docs>;
};

/** Resolves relation ids in `docs` in place. One query per relation or join field per hop. */
export async function populate(
  db: Kysely<Database>,
  collections: Collections,
  fields: Fields,
  docs: Docs,
  spec: Spec | true,
  read: ReadHooks,
) {
  if (!docs.length) return;
  for (const [key, field] of Object.entries(fields)) {
    const { on, child } = step(spec, key, field);
    if (!on) continue;
    if (field.type === "group") {
      const values = docs.map((d) => d[key]).filter(Boolean);
      await populate(db, collections, field.fields, values, child, read);
    } else if (field.type === "relation") {
      const ids = [...new Set(docs.flatMap((d) => d[key] ?? []))];
      const found = await hop(field.collection, await byIds(db, field.collection, ids));
      for (const d of docs) {
        if (d[key] == null) continue;
        d[key] = field.many
          ? d[key].map((id: string) => found.get(id)).filter(Boolean)
          : (found.get(d[key]) ?? null);
      }
    } else if (field.type === "join") {
      const target = collections[field.collection].fields;
      const source = relationPaths(target).find((r) => r.path.join(".") === field.on)!.field;
      const ids = docs.map((d) => d.id);
      const rows = await joinedDocs(db, field.collection, field.on, source.many, ids);
      const unique = [...new Map(rows.map((r) => [r.id, toDoc(r)])).values()];
      const found = await hop(field.collection, unique);
      for (const d of docs)
        d[key] = rows.filter((r) => r.ref === d.id && found.has(r.id)).map((r) => found.get(r.id));
    }

    // Loaded documents of the target run its read hooks and the next hop, in the same order as a top-level read.
    async function hop(collection: string, loaded: Docs) {
      const before = await read.before(collection, loaded);
      await populate(db, collections, collections[collection].fields, before, child, read);
      return new Map((await read.after(collection, before)).map((d) => [d.id, d]));
    }
  }
}

/** `doc` with only the keys in `select`. `id` is kept at every document level (`meta`). Values that are not objects stay as they are. */
export function pick(
  collections: Collections,
  fields: Fields,
  doc: Record<string, any>,
  select: SelectSpec,
  meta = true,
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, s] of Object.entries(meta ? { id: true as const, ...select } : select)) {
    if (!Object.hasOwn(doc, key)) continue;
    const f = Object.hasOwn(fields, key) ? fields[key] : undefined;
    const inner = f && s !== true && innerFields(collections, f);
    out[key] = inner
      ? mapValue(doc[key], (d) => pick(collections, inner, d, s as SelectSpec, f.type !== "group"))
      : doc[key];
  }
  return out;
}

const META = ["id", "createdAt", "updatedAt"];

/**
 * The first path in `select` that does not fit `fields` and the populate `spec`, or `undefined`. Same resolution rules as `populate()`.
 * `doc`: this level is a document, so `id`, `createdAt` and `updatedAt` exist. Groups and globals have none.
 */
export function badSelectPath(
  collections: Collections,
  fields: Fields,
  select: SelectSpec,
  spec: Spec | true,
  prefix = "",
  doc = true,
): string | undefined {
  for (const [key, s] of Object.entries(select)) {
    const path = prefix + key;
    if (doc && s === true && META.includes(key)) continue;
    if (!Object.hasOwn(fields, key) || (s !== true && !isObject(s))) return path;
    if (s === true) continue;
    const f = fields[key];
    const inner = innerFields(collections, f);
    const { on, child } = step(spec, key, f);
    if (!inner || !on) return path;
    const error = badSelectPath(collections, inner, s, child, `${path}.`, f.type !== "group");
    if (error) return error;
  }
}
