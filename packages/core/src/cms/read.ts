import { findDocs, loadGlobal } from "../db/documents.ts";
import { runHooks } from "../schema/hooks/run.ts";
import type { Fields, LocalApi, Operation } from "../schema/index.ts";
import { fieldHooks, filterable } from "../schema/walk.ts";
import { decorate } from "../media/images.ts";
import { badSelectPath, pick, populate, type SelectSpec, type Spec, toSpec } from "./populate.ts";
import {
  col,
  type Core,
  glob,
  hookArgs,
  type Inner,
  isMedia,
  type Name,
  q,
  slot,
  target,
} from "./scope.ts";

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

/** `getGlobal`. Fields that were never saved are missing. */
export async function readGlobal(core: Core, s: Inner, name: string, options: ReadOpts) {
  const { spec, select } = readSpec(core, core.schema.globals[name].fields, options, false);
  const data = (await loadGlobal(await q(core, s), name, s.drafts)) ?? {
    publishedAt: null,
    hasDraft: false,
  };
  return (await readDocs(core, s, glob(name), [data], spec, select))[0];
}

/** Field `afterRead` per document, then the collection's or global's once for the batch. */
export async function afterRead(
  core: Core,
  s: Inner,
  name: Name,
  docs: Record<string, any>[],
  operation: Operation,
  draft = false,
) {
  const { fields } = target(core, name);
  for (const doc of docs)
    await fieldHooks("afterRead", fields, doc, hookArgs(s, name, { operation, data: doc, draft }));
  return runHooks(
    slot(core, name, "afterRead"),
    "docs",
    docs,
    hookArgs(s, name, { operation, draft }),
  );
}

const beforeRead = (
  core: Core,
  s: Inner,
  name: Name,
  docs: Record<string, any>[],
  operation: Operation,
) => runHooks(slot(core, name, "beforeRead"), "docs", docs, hookArgs(s, name, { operation }));

// `beforeRead` on the loaded documents, then relations, then `afterRead`, then media URLs, then `select`.
async function readDocs(
  core: Core,
  s: Inner,
  name: Name,
  docs: Record<string, any>[],
  spec: Spec,
  select: SelectSpec | undefined,
) {
  const { collections } = core.schema;
  const { fields } = target(core, name);
  const { media } = core;
  const operation = name.kind === "collection" ? "read" : "getGlobal";
  const before = await beforeRead(core, s, name, docs, operation);
  await populate(await q(core, s), collections, fields, before, spec, {
    drafts: !!s.drafts,
    // Populated documents run their own collection's read hooks, in the scope of the outer read.
    before: (collection, docs) => beforeRead(core, s, col(collection), docs, "read"),
    after: (collection, docs) => afterRead(core, s, col(collection), docs, "read"),
    media:
      media &&
      ((doc, field) => decorate(media, doc, field.type === "image" ? field.image : undefined)),
  });
  let result = await afterRead(core, s, name, before, operation);
  if (media && isMedia(name)) result = result.map((d) => decorate(media, d));
  return select ? result.map((d) => pick(collections, fields, d, select)) : result;
}

// The populate spec and the checked `select` of read options. Throws for a `select` that does not fit
// the fields or what `populate` resolves. `doc`: false for globals, which have no meta keys.
function readSpec(core: Core, fields: Fields, options: ReadOpts, doc = true) {
  const spec = toSpec(options, core.defaults.depth);
  const select = options.select as SelectSpec | undefined;
  const error = select && badSelectPath(core.schema.collections, fields, select, spec, "", doc);
  if (error) throw new Error(`Invalid select: ${error}`);
  return { spec, select };
}
