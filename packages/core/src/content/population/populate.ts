import { type Database } from "../../db/types.ts";
import { toDoc } from "../../db/map-document.ts";
import { byIds } from "../../db/queries/documents/load-by-ids.query.ts";
import { joinedDocs } from "../../db/queries/references/joined-documents.query.ts";
import { isRef, targetOf } from "../../schema/traversal/reference-fields.ts";
import { relationPaths } from "../../schema/traversal/relation-paths.ts";
import {
  type Collection,
  type Fields,
  type FileField,
  type ImageField,
} from "../../schema/index.ts";
import { type Spec, step } from "./population-spec.ts";
import type { Kysely } from "kysely";
type Docs = Record<string, any>[];
type Collections = Record<string, Collection>;

/** Read hooks of the target collection. They get the loaded documents per field per hop, and MAY replace them. */
export type ReadHooks = {
  /** Loads targets in the drafts perspective. */
  drafts: boolean;
  before(collection: string, docs: Docs): Promise<Docs>;
  after(collection: string, docs: Docs): Promise<Docs>;
  /** Adds the computed URLs of a media document, with the options of the field that holds it. */
  media?(doc: Record<string, any>, field: ImageField | FileField): Record<string, any>;
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
    } else if (isRef(field)) {
      const to = targetOf(field);
      const ids = [...new Set(docs.flatMap((d) => d[key] ?? []))];
      const found = await hop(to, await byIds(db, to, ids, read.drafts));
      const value = (id: string) => {
        const doc = found.get(id);
        return doc && field.type !== "relation" && read.media ? read.media(doc, field) : doc;
      };
      for (const d of docs) {
        if (d[key] == null) continue;
        d[key] = field.many ? d[key].map(value).filter(Boolean) : (value(d[key]) ?? null);
      }
    } else if (field.type === "join") {
      const target = collections[field.collection].fields;
      const source = relationPaths(target).find((r) => r.path.join(".") === field.on)!.field;
      const ids = docs.map((d) => d.id);
      const rows = await joinedDocs(db, field.collection, field.on, source.many, ids, read.drafts);
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
