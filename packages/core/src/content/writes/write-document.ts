import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { type Name, target } from "../targets.ts";
import { q } from "../../cms/runtime/transaction.ts";
import { hookArgs } from "../lifecycle/hook-args.ts";
import { loadGlobal } from "../../db/queries/globals/load-global.query.ts";
import { loadDoc } from "../../db/queries/documents/load-document.query.ts";
import type { Db } from "../../db/queries/document-sql.ts";
import { prepareData } from "./helpers/prepare-data.ts";
import { storeDraft, storeDocument } from "./helpers/store.ts";

export type WriteFlags = {
  /** An `onDelete` effect. It skips id checks, because other relations of the document MAY point to documents that the same delete removes. */
  effect?: boolean;
  /** A draft save. See `write()`. */
  draft?: boolean;
};
export type Operation = "create" | "update" | "setGlobal";
export type Fields = ReturnType<typeof target>["fields"];

/**
 * Shared by `create`, `update`, `setGlobal` and publish.
 *
 * Draft saves check field types and run before hooks, but skip field validation, integrity checks and after-change hooks.
 * Publish merges the draft over published data.
 *
 * @returns The written document after read hooks, or `undefined` when an update target is missing.
 */
export async function write(
  core: Core,
  s: Inner,
  name: Name,
  operation: Operation,
  input: unknown,
  options: WriteFlags & { id?: string; publish?: boolean } = {},
) {
  const { id, effect, draft = false, publish = false } = options;
  const { fields } = target(core, name);
  const db = await q(core, s);

  // Draft writes and publishes merge over the draft. Other writes merge over published data.
  const source = await loadSource(db, name, id, draft || publish);
  if (id && !source) return undefined;

  // Publish hooks compare with published data, which may be absent on the first publish.
  const originalDoc = publish ? await loadSource(db, name, id, false) : source;
  const args = hookArgs(s, name, { operation, id, originalDoc, draft });

  // Prepare data and store either as a draft or as a published document
  const data = await prepareData(core, name, operation, input, source, fields, args, draft, effect);
  if (draft) return storeDraft(db, core, s, name, operation, id, data);
  return storeDocument(
    db,
    core,
    s,
    name,
    operation,
    fields,
    id,
    effect,
    publish,
    originalDoc,
    args,
    data,
  );
}

async function loadSource(db: Db, name: Name, id: string | undefined, drafts: boolean) {
  if (name.kind === "global") return loadGlobal(db, name.name, drafts);
  return id ? loadDoc(db, name.name, id, drafts) : undefined;
}
