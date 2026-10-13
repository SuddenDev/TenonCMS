import { findDocs } from "../../db/queries/documents/find-documents.query.ts";
import { type Fields, type LocalApi } from "../../schema/index.ts";
import { filterable } from "../../schema/traversal/filterable.ts";
import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { col } from "../targets.ts";
import { q } from "../../cms/runtime/transaction.ts";
import { readDocs, readPlan } from "./read-results.ts";
import { locOf } from "./loc-of.ts";
import { metaKeys } from "../population/validate-select.ts";

export type ReadOpts = NonNullable<Parameters<LocalApi["find"]>[1]> & { id?: string };

/**
 * Shared by `find`, `findOne` and `findById`.
 * @returns The matching documents after read hooks, population and `select`.
 */
export async function read(core: Core, s: Inner, collection: string, options: ReadOpts) {
  const entry = core.schema.collections[collection];
  const { fields } = entry;
  const { plan, select } = readPlan(core, fields, options, metaKeys(entry.localized));
  checkWhere(fields, options.where);

  const docs = await findDocs(await q(core, s), collection, {
    ...options,
    drafts: s.perspective === "drafts",
    loc: locOf(core, s, entry),
  });
  return readDocs(core, s, col(collection), docs, plan, select, options.alternates);
}

// Ensures that all fields used in the `where` clause exist and are filterable.
function checkWhere(fields: Fields, where: ReadOpts["where"]) {
  for (const key of Object.keys(where ?? {})) {
    if (!Object.hasOwn(fields, key)) throw new Error(`Unknown field "${key}"`);
    if (!filterable(fields, key)) throw new Error(`Field "${key}" is not filterable`);
  }
}
