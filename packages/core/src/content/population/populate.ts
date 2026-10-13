import { type Database } from "../../db/types.ts";
import { toDoc } from "../../db/map-document.ts";
import { loadByIds } from "../../db/queries/documents/load-by-ids.query.ts";
import { type Loc } from "../../db/queries/document-sql.ts";
import { joinedDocs } from "../../db/queries/references/joined-documents.query.ts";
import { blockGroups } from "../../schema/traversal/inner-fields.ts";
import { isRef, targetOf } from "../../schema/traversal/reference-fields.ts";
import { plainPath, relationPaths } from "../../schema/traversal/relation-paths.ts";
import {
  type Collection,
  type Fields,
  type FileField,
  type ImageField,
  type JoinField,
  type RefField,
} from "../../schema/index.ts";
import { isObject } from "../../schema/condition.ts";
import { type PopulatePlan, step } from "./populate-plan.ts";
import type { Kysely } from "kysely";

type Docs = Record<string, any>[];
type Collections = Record<string, Collection>;

/** Read hooks of the target collection. They get the loaded documents per field per hop, and MAY replace them. */
export type ReadHooks = {
  /** Loads targets in the drafts perspective. */
  drafts: boolean;
  /** How a localized target collection reads, in the locale of the outer read. */
  loc?(collection: string): Loc | undefined;
  before(collection: string, docs: Docs): Promise<Docs>;
  after(collection: string, docs: Docs): Promise<Docs>;
  /** Adds the computed URLs of a media document, with the options of the field that holds it. */
  media?(doc: Record<string, any>, field: ImageField | FileField): Record<string, any>;
};

type Hop = {
  db: Kysely<Database>;
  collections: Collections;
  read: ReadHooks;
  /** The plan the loaded documents continue with. */
  child: PopulatePlan | true;
};

/**
 * Resolves relation ids in `docs` in place. One query per relation or join field per hop.
 * @returns Nothing. `docs` holds the resolved values.
 */
export async function populate(
  db: Kysely<Database>,
  collections: Collections,
  fields: Fields,
  docs: Docs,
  plan: PopulatePlan | true,
  read: ReadHooks,
) {
  if (!docs.length) return;

  for (const [key, field] of Object.entries(fields)) {
    const { on, child } = step(plan, key, field);
    if (!on) continue;

    const ctx: Hop = { db, collections, read, child };
    if (field.type === "group") {
      const values = docs.map((d) => d[key]).filter(Boolean);
      await populate(db, collections, field.fields, values, child, read);
    } else if (field.type === "array" || field.type === "blocks") {
      // The items of every document populate together, so it stays one query per field per hop and block.
      const items = docs.flatMap((d) => (Array.isArray(d[key]) ? d[key].filter(isObject) : []));
      if (field.type === "array") await populate(db, collections, field.fields, items, child, read);
      else
        for (const [name, group] of Object.entries(blockGroups(field))) {
          const own = items.filter((item) => item.blockType === name);
          await populate(db, collections, group.fields, own, step(child, name, group).child, read);
        }
    } else if (isRef(field)) {
      await resolveRef(ctx, docs, key, field);
    } else if (field.type === "join") {
      await resolveJoin(ctx, docs, key, field);
    }
  }
}

// Resolves reference fields by loading the target documents and applying read hooks.
async function resolveRef(ctx: Hop, docs: Docs, key: string, field: RefField) {
  const to = targetOf(field);
  const ids = [...new Set(docs.flatMap((d) => d[key] ?? []))];
  const found = await hop(
    ctx,
    to,
    await loadByIds(ctx.db, to, ids, ctx.read.drafts, ctx.read.loc?.(to)),
  );

  const { media } = ctx.read;
  const value = (id: string) => {
    const doc = found.get(id);
    return doc && field.type !== "relation" && media ? media(doc, field) : doc;
  };

  for (const d of docs) {
    if (d[key] == null) continue;
    d[key] = field.many ? d[key].map(value).filter(Boolean) : (value(d[key]) ?? null);
  }
}

// Resolves join fields by loading the target documents and applying read hooks.
async function resolveJoin(ctx: Hop, docs: Docs, key: string, field: JoinField) {
  const target = ctx.collections[field.collection].fields;
  const source = relationPaths(target).find((r) => plainPath(r.path) === field.on)!.field;

  const ids = docs.map((d) => d.id);
  const loc = ctx.read.loc?.(field.collection);
  const rows = await joinedDocs(
    ctx.db,
    field.collection,
    field.on,
    source.many,
    ids,
    ctx.read.drafts,
    loc,
  );
  const unique = [...new Map(rows.map((r) => [r.id, toDoc(r, loc)])).values()];
  const found = await hop(ctx, field.collection, unique);

  for (const d of docs)
    d[key] = rows.filter((r) => r.ref === d.id && found.has(r.id)).map((r) => found.get(r.id));
}

// Loaded documents of the target run its read hooks and the next hop, in the same order as a top-level read.
async function hop({ db, collections, read, child }: Hop, collection: string, loaded: Docs) {
  const before = await read.before(collection, loaded);
  await populate(db, collections, collections[collection].fields, before, child, read);
  return new Map((await read.after(collection, before)).map((d) => [d.id, d]));
}
