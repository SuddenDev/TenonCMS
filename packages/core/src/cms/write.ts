import {
  deleteDoc,
  discardDraft,
  discardGlobalDraft,
  insertDoc,
  insertDraft,
  loadDoc,
  loadGlobal,
  saveDraft,
  saveGlobal,
  saveGlobalDraft,
  updateDoc,
} from "../db/documents.ts";
import { ValidationError } from "../errors.ts";
import { isObject } from "../schema/condition.ts";
import { runHooks } from "../schema/hooks/run.ts";
import { parseData } from "../schema/validate.ts";
import { applyDefaults, fieldHooks, fillSlugs, runValidate } from "../schema/walk.ts";
import { afterRead } from "./read.ts";
import { checkRefs, checkUnique, onDelete } from "./refs.ts";
import { run } from "./run.ts";
import {
  col,
  type Core,
  glob,
  hookArgs,
  type Inner,
  type Name,
  q,
  type Scope,
  slot,
  target,
} from "./scope.ts";

// The stored data of a document, without its meta.
const stripMeta = ({
  id,
  createdAt,
  updatedAt,
  publishedAt,
  hasDraft,
  ...data
}: Record<string, unknown>) => data;

type WriteFlags = {
  /** An `onDelete` effect. It skips id checks, because other relations of the document MAY point to documents that the same delete removes. */
  effect?: boolean;
  /** A draft save. See `write()`. */
  draft?: boolean;
};

// Draft saves carry `draft: true` in their args, so `run()` passes it to `beforeOperation` and `afterOperation`.
const flag = (draft?: boolean) => (draft ? { draft } : {});

export const create = (
  core: Core,
  scope: Scope,
  collection: string,
  data: unknown,
  draft = false,
) =>
  run(core, scope, "create", col(collection), { collection, data, ...flag(draft) }, (s, args) =>
    write(core, s, col(collection), "create", args.data, { draft }),
  );

export const update = (
  core: Core,
  scope: Scope,
  collection: string,
  id: string,
  data: unknown,
  { effect, draft }: WriteFlags = {},
) =>
  run(core, scope, "update", col(collection), { collection, id, data, ...flag(draft) }, (s, args) =>
    write(core, s, col(collection), "update", args.data, { id: args.id, effect, draft }),
  );

export const setGlobal = (
  core: Core,
  scope: Scope,
  name: string,
  data: unknown,
  { effect, draft }: WriteFlags = {},
) =>
  run(core, scope, "setGlobal", glob(name), { global: name, data, ...flag(draft) }, (s, args) =>
    write(core, s, glob(name), "setGlobal", args.data, { effect, draft }),
  );

// A publish is an `update` or `setGlobal` of the draft: the whole pipeline runs on `COALESCE(draft, data)`.
export const publish = (core: Core, scope: Scope, name: Name, id?: string) =>
  name.kind === "global"
    ? run(core, scope, "setGlobal", name, { global: name.name }, (s) =>
        write(core, s, name, "setGlobal", {}, { publish: true }),
      )
    : run(core, scope, "update", name, { collection: name.name, id }, (s, args) =>
        write(core, s, name, "update", {}, { id: args.id, publish: true }),
      );

/**
 * Drops the draft. A document that was never published is deleted, with its `onDelete` effects.
 * Returns the published document, or `undefined` when it is deleted or missing.
 */
export const discard = (core: Core, scope: Scope, name: Name, id?: string) =>
  name.kind === "global"
    ? run(core, scope, "setGlobal", name, { global: name.name }, async (s) => {
        const db = await q(core, s);
        await discardGlobalDraft(db, name.name);
        const doc = (await loadGlobal(db, name.name)) ?? { publishedAt: null, hasDraft: false };
        return (await afterRead(core, s, name, [doc], "setGlobal"))[0];
      })
    : run(core, scope, "update", name, { collection: name.name, id }, async (s, args) => {
        const db = await q(core, s);
        const doc = await loadDoc(db, name.name, args.id, true);
        if (!doc) return undefined;
        if (doc.publishedAt === null) {
          await remove(core, s, name.name, args.id);
          return undefined;
        }
        const stored = await discardDraft(db, name.name, args.id);
        return (await afterRead(core, s, name, [stored], "update"))[0];
      });

/**
 * Shared by `create`, `update`, `setGlobal` and publish. Returns `undefined` for a missing document.
 * A draft save runs defaults, slugs, `beforeValidate`, a type check and `beforeChange`, then stores the draft.
 * It skips `validate`, `unique`, id checks and `afterChange`. A publish runs on the document with its draft.
 */
export async function write(
  core: Core,
  s: Inner,
  name: Name,
  operation: "create" | "update" | "setGlobal",
  input: unknown,
  {
    id,
    effect,
    draft = false,
    publish = false,
  }: WriteFlags & { id?: string; publish?: boolean } = {},
) {
  const { fields } = target(core, name);
  const db = await q(core, s);
  const load = (drafts: boolean) =>
    name.kind === "global"
      ? loadGlobal(db, name.name, drafts)
      : id
        ? loadDoc(db, name.name, id, drafts)
        : undefined;
  // Draft saves and publishes merge over the draft. A plain write MUST merge over the published data, also in a drafts scope.
  const source = await load(draft || publish);
  if (id && !source) return undefined;
  // Hooks of a publish compare with the published document, which is `undefined` on a first publish.
  const originalDoc = publish ? await load(false) : source;
  const args = hookArgs(s, name, { operation, id, originalDoc, draft });
  const fieldArgs = (data: Record<string, unknown>) => ({ ...args, data });

  // `update` and `setGlobal` change only the top-level keys they get. The others keep their stored values.
  const copy =
    source && isObject(input)
      ? { ...stripMeta(source), ...structuredClone(input) }
      : structuredClone(input);
  if (isObject(copy)) {
    if (operation === "create") await applyDefaults(fields, copy, args);
    await fillSlugs(fields, copy);
    await fieldHooks("beforeValidate", fields, copy, fieldArgs(copy));
  }
  const valid = parseData(
    fields,
    await runHooks(slot(core, name, "beforeValidate"), "data", copy, args),
    draft,
  );

  // `onDelete` effects only clear references, so the document's own rules do not apply.
  if (!effect && !draft) {
    const errors = await runValidate(fields, valid, fieldArgs(valid));
    if (Object.keys(errors).length) throw new ValidationError(errors);
  }
  await fieldHooks("beforeChange", fields, valid, fieldArgs(valid));
  // Validated again, so a hook cannot store invalid data.
  const data = parseData(
    fields,
    await runHooks(slot(core, name, "beforeChange"), "data", valid, args),
    draft,
  );

  if (draft) {
    let stored: Record<string, any>;
    if (name.kind === "global") {
      await saveGlobalDraft(db, name.name, data);
      stored = (await loadGlobal(db, name.name, true))!;
    } else if (id) stored = await saveDraft(db, name.name, id, data);
    else stored = await insertDraft(db, name.name, data);
    return (await afterRead(core, s, name, [stored], operation, true))[0];
  }

  if (name.kind === "collection") await checkUnique(db, name.name, fields, data, id);
  if (!effect) await checkRefs(db, fields, data, id ? { collection: name.name, id } : undefined);

  let stored: Record<string, any>;
  if (name.kind === "global") {
    await saveGlobal(db, name.name, data, publish);
    stored = publish ? (await loadGlobal(db, name.name))! : data;
  } else if (id) stored = await updateDoc(db, name.name, id, data, publish);
  else stored = await insertDoc(db, name.name, data);

  await fieldHooks("afterChange", fields, stored, fieldArgs(stored));
  const doc = await runHooks(
    slot(core, name, "afterChange"),
    "doc",
    stored,
    hookArgs(s, name, { operation, previousDoc: originalDoc }),
  );
  return (await afterRead(core, s, name, [doc], operation))[0];
}

/** `delete`: the hooks around the row delete, then `onDelete` for every reference. */
export async function remove(core: Core, s: Inner, collection: string, id: string) {
  const db = await q(core, s);
  // A delete removes the row whether it was published or not.
  const doc = await loadDoc(db, collection, id, true);
  if (!doc) return;
  const base = hookArgs(s, col(collection), { id, doc });
  await runHooks(slot(core, col(collection), "beforeDelete"), "doc", doc, base);
  await deleteDoc(db, collection, id);
  await onDelete(db, core.schema, collection, id, {
    update: (collection, id, data) => update(core, s, collection, id, data, { effect: true }),
    setGlobal: (name, data) => setGlobal(core, s, name, data, { effect: true }),
    delete: (collection, id) => s.cms.delete(collection, id),
  });
  await runHooks(slot(core, col(collection), "afterDelete"), "doc", doc, base);
}
