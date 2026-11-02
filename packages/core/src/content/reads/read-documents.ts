import { findDocs } from "../../db/queries/documents/find-documents.query.ts";
import { type LocalApi } from "../../schema/index.ts";
import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { collectionTarget } from "../targets.ts";
import { databaseForScope } from "../../cms/runtime/transaction.ts";
import { readDocs, readPlan } from "./read-results.ts";
import { locOf } from "./loc-of.ts";
import { metaKeys } from "../population/validate-select.ts";
import { requireRead, checkReadWhere } from "../../access/read.ts";

export type ReadOpts = NonNullable<Parameters<LocalApi["find"]>[1]> & { id?: string };

/**
 * Shared by `find`, `findOne` and `findById`. The read rule's `where` narrows the query.
 * @returns The matching documents after read hooks, population and `select`.
 * @throws {ForbiddenError} When the read rule denies.
 */
export async function read(core: Core, s: Inner, collection: string, options: ReadOpts) {
  const name = collectionTarget(collection);
  const entry = core.schema.collections[collection];
  const { plan, select } = readPlan(core, entry.fields, options, metaKeys(entry.localized));
  const drafts = s.perspective === "drafts";

  const access = await requireRead(core, s, name, { id: options.id });
  await checkReadWhere(core, s, name, options.where);

  const docs = await findDocs(await databaseForScope(core, s), collection, {
    ...options,
    access: access === true ? undefined : access,
    drafts,
    loc: await locOf(core, s, name),
  });
  return readDocs(core, s, name, docs, plan, select, options.alternates);
}
