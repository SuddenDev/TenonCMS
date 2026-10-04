import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { col, type Name, isMedia, target } from "../targets.ts";
import { q } from "../../cms/runtime/transaction.ts";
import { beforeRead, afterRead } from "./run-read-hooks.ts";
import { type Fields } from "../../schema/index.ts";
import { type ReadOpts } from "./read-documents.ts";
import { decorate } from "../../media/images.ts";
import { type Spec, toSpec } from "../population/population-spec.ts";
import { type SelectSpec, pick } from "../population/select-fields.ts";
import { badSelectPath } from "../population/validate-select.ts";
import { populate } from "../population/populate.ts";

// `beforeRead` on the loaded documents, then relations, then `afterRead`, then media URLs, then `select`.
export async function readDocs(
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
export function readSpec(core: Core, fields: Fields, options: ReadOpts, doc = true) {
  const spec = toSpec(options, core.defaults.depth);
  const select = options.select as SelectSpec | undefined;
  const error = select && badSelectPath(core.schema.collections, fields, select, spec, "", doc);
  if (error) throw new Error(`Invalid select: ${error}`);
  return { spec, select };
}
