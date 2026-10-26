import { findDocs } from "../../db/queries/documents/find-documents.query.ts";
import { type LocalApi } from "../../schema/index.ts";
import { filterable } from "../../schema/traversal/filterable.ts";
import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { ValidationError } from "../../errors.ts";
import { col } from "../targets.ts";
import { q } from "../../cms/runtime/transaction.ts";
import { readDocs, readPlan } from "./read-results.ts";
import { locOf } from "./loc-of.ts";
import { metaKeys } from "../population/validate-select.ts";
import { hookArgs } from "../lifecycle/hook-args.ts";
import { permit } from "../../access/rule.ts";
import { fieldAllowed } from "../../access/field-access.ts";

export type ReadOpts = NonNullable<Parameters<LocalApi["find"]>[1]> & { id?: string };

/** The meta keys `where` accepts next to the fields. */
const AUTHORS = ["createdBy", "updatedBy"];

/**
 * Shared by `find`, `findOne` and `findById`. The read rule's `where` narrows the query.
 * @returns The matching documents after read hooks, population and `select`.
 * @throws {ForbiddenError} When the read rule denies.
 */
export async function read(core: Core, s: Inner, collection: string, options: ReadOpts) {
  const name = col(collection);
  const entry = core.schema.collections[collection];
  const { plan, select } = readPlan(core, entry.fields, options, metaKeys(entry.localized));
  const drafts = s.perspective === "drafts";

  const access = await permit(core, s, name, "read", { draft: drafts, id: options.id });
  await checkWhere(core, s, collection, options.where);

  const docs = await findDocs(await q(core, s), collection, {
    ...options,
    access: access === true ? undefined : access,
    drafts,
    loc: locOf(core, s, entry),
  });
  return readDocs(core, s, name, docs, plan, select, options.alternates);
}

/**
 * Ensures that every key of `where` is a filterable field, or `createdBy` / `updatedBy`, that the caller can read.
 * @throws {Error} For an unknown or unfilterable field.
 * @throws {ValidationError} For a field the caller cannot read, and for the authors without a user.
 */
async function checkWhere(core: Core, s: Inner, collection: string, where: ReadOpts["where"]) {
  const { fields } = core.schema.collections[collection];
  const denied = (key: string) => new ValidationError({ [key]: "Not filterable" });
  for (const key of Object.keys(where ?? {})) {
    if (AUTHORS.includes(key)) {
      if (!s.user && !s.overrideAccess) throw denied(key);
      continue;
    }
    if (!Object.hasOwn(fields, key)) throw new Error(`Unknown field "${key}"`);
    if (!filterable(fields, key)) throw new Error(`Field "${key}" is not filterable`);
    const args = { ...hookArgs(s, col(collection), {}), path: key };
    if (!(await fieldAllowed(s, fields[key], "read", args))) throw denied(key);
  }
}
