import { findDocs } from "../../db/queries/documents/find-documents.query.ts";
import { type LocalApi } from "../../schema/index.ts";
import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { collectionTarget } from "../targets.ts";
import { databaseForScope } from "../../cms/runtime/transaction.ts";
import { readDocs, readPlan } from "./read-results.ts";
import { locOf } from "./loc-of.ts";
import { metaKeys } from "../population/validate-select.ts";
import { requireRead, checkReadWhere } from "../../access/read.ts";
import { ValidationError } from "../../errors.ts";

export type ReadOpts = NonNullable<Parameters<LocalApi["find"]>[1]> & { id?: string };

/**
 * Shared by `find`, `findOne` and `findById`. The read rule's `where` narrows the query.
 * @returns The matching documents after read hooks, population and `select`.
 * @throws {ValidationError} When `limit` is not a positive integer.
 * @throws {ForbiddenError} When the read rule denies.
 */
export async function read(core: Core, s: Inner, collection: string, options: ReadOpts) {
  const { limit } = options;
  if (limit !== undefined && !(Number.isSafeInteger(limit) && limit > 0))
    throw new ValidationError({ limit: "Invalid limit" });

  const name = collectionTarget(collection);
  const entry = core.schema.collections[collection];
  const { plan, select } = readPlan(core, entry.fields, options, metaKeys(entry.localized));

  const access = await requireRead(core, s, name, { id: options.id });
  await checkReadWhere(core, s, name, options.where);

  const docs = await findDocs(await databaseForScope(core, s), collection, {
    ...options,
    access: access === true ? undefined : access,
    perspective: s.perspective,
    loc: await locOf(core, s, name),
  });
  return readDocs(core, s, name, docs, plan, select, options);
}
