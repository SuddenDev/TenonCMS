import { findDocs } from "../../db/queries/documents/find-documents.query.ts";
import { type LocalApi } from "../../schema/index.ts";
import { filterable } from "../../schema/traversal/filterable.ts";
import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { col } from "../targets.ts";
import { q } from "../../cms/runtime/transaction.ts";
import { readDocs, readSpec } from "./read-results.ts";

export type ReadOpts = NonNullable<Parameters<LocalApi["find"]>[1]> & { id?: string };

/** `find`, `findOne` and `findById`. */
export async function read(core: Core, s: Inner, collection: string, options: ReadOpts) {
  const { fields } = core.schema.collections[collection];
  const { spec, select } = readSpec(core, fields, options);
  for (const key of Object.keys(options.where ?? {})) {
    if (!Object.hasOwn(fields, key)) throw new Error(`Unknown field "${key}"`);
    if (!filterable(fields, key)) throw new Error(`Field "${key}" is not filterable`);
  }
  const docs = await findDocs(await q(core, s), collection, { ...options, drafts: s.drafts });
  return readDocs(core, s, col(collection), docs, spec, select);
}
