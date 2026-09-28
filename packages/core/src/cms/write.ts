import {
  deleteDoc,
  insertDoc,
  loadDoc,
  loadGlobal,
  saveGlobal,
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

// The stored data of a document, without `id`, `createdAt` and `updatedAt`.
const stripMeta = ({ id, createdAt, updatedAt, ...data }: Record<string, unknown>) => data;

// `effect`: an `onDelete` effect. It skips id checks, because other relations of the document MAY point to
// documents that the same delete removes.
export const update = (
  core: Core,
  scope: Scope,
  collection: string,
  id: string,
  data: unknown,
  effect = false,
) =>
  run(core, scope, "update", col(collection), { collection, id, data }, (s, args) =>
    write(core, s, col(collection), "update", args.data, { id: args.id, effect }),
  );

export const setGlobal = (core: Core, scope: Scope, name: string, data: unknown, effect = false) =>
  run(core, scope, "setGlobal", glob(name), { global: name, data }, (s, args) =>
    write(core, s, glob(name), "setGlobal", args.data, { effect }),
  );

/** Shared by `create`, `update` and `setGlobal`. Returns `undefined` for a missing document. */
export async function write(
  core: Core,
  s: Inner,
  name: Name,
  operation: "create" | "update" | "setGlobal",
  input: unknown,
  { id, effect }: { id?: string; effect?: boolean } = {},
) {
  const { fields } = target(core, name);
  const db = await q(core, s);
  const originalDoc =
    name.kind === "global"
      ? await loadGlobal(db, name.name)
      : id
        ? await loadDoc(db, name.name, id)
        : undefined;
  if (id && !originalDoc) return undefined;
  const args = hookArgs(s, name, { operation, id, originalDoc });
  const fieldArgs = (data: Record<string, unknown>) => ({ ...args, data });

  // `update` and `setGlobal` change only the top-level keys they get. The others keep their stored values.
  const copy =
    originalDoc && isObject(input)
      ? { ...stripMeta(originalDoc), ...structuredClone(input) }
      : structuredClone(input);
  if (isObject(copy)) {
    if (operation === "create") await applyDefaults(fields, copy, args);
    await fillSlugs(fields, copy);
    await fieldHooks("beforeValidate", fields, copy, fieldArgs(copy));
  }
  const valid = parseData(
    fields,
    await runHooks(slot(core, name, "beforeValidate"), "data", copy, args),
  );

  // `onDelete` effects only clear references, so the document's own rules do not apply.
  if (!effect) {
    const errors = await runValidate(fields, valid, fieldArgs(valid));
    if (Object.keys(errors).length) throw new ValidationError(errors);
  }
  await fieldHooks("beforeChange", fields, valid, fieldArgs(valid));
  // Validated again, so a hook cannot store invalid data.
  const data = parseData(
    fields,
    await runHooks(slot(core, name, "beforeChange"), "data", valid, args),
  );
  if (name.kind === "collection") await checkUnique(db, name.name, fields, data, id);
  if (!effect) await checkRefs(db, fields, data, id ? { collection: name.name, id } : undefined);

  let stored: Record<string, any>;
  if (name.kind === "global") {
    await saveGlobal(db, name.name, data);
    stored = data;
  } else if (id) stored = await updateDoc(db, name.name, id, data);
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
  const doc = await loadDoc(db, collection, id);
  if (!doc) return;
  const base = hookArgs(s, col(collection), { id, doc });
  await runHooks(slot(core, col(collection), "beforeDelete"), "doc", doc, base);
  await deleteDoc(db, collection, id);
  await onDelete(db, core.schema, collection, id, {
    update: (collection, id, data) => update(core, s, collection, id, data, true),
    setGlobal: (name, data) => setGlobal(core, s, name, data, true),
    delete: (collection, id) => s.cms.delete(collection, id),
  });
  await runHooks(slot(core, col(collection), "afterDelete"), "doc", doc, base);
}
