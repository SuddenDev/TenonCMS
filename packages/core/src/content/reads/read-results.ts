import { resolveRichtext } from "../../richtext/reads/resolve-richtext.ts";
import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { collectionTarget, type ContentTarget, isMedia, target } from "../targets.ts";
import { databaseForScope } from "../../cms/runtime/transaction.ts";
import { beforeRead, afterRead } from "../lifecycle/run-read-hooks.ts";
import { type Fields } from "../../schema/index.ts";
import { type ReadOpts } from "./read-documents.ts";
import { decorate } from "../../media/images/decorate.ts";
import { type PopulatePlan, toPopulatePlan } from "../population/populate-plan.ts";
import { type SelectSpec, pick } from "../population/select-fields.ts";
import { badSelectPath, metaKeys } from "../population/validate-select.ts";
import { populate } from "../population/populate.ts";
import { addAlternates } from "./alternates.ts";
import { locOf } from "./loc-of.ts";
import { readDecision } from "../../access/read.ts";

/**
 * Runs `beforeRead` on the loaded documents, then population, then `afterRead`, then media URLs, then `alternates`
 * when asked for and selected, then `select`.
 * @returns The documents as the read returns them.
 */
export async function readDocs(
  core: Core,
  s: Inner,
  name: ContentTarget,
  docs: Record<string, any>[],
  plan: PopulatePlan,
  select: SelectSpec | undefined,
  alternates = false,
) {
  const { collections } = core.schema;
  const { fields } = target(core, name);
  const { media } = core;
  const operation = name.kind === "collection" ? "read" : "getGlobal";
  const drafts = s.perspective === "drafts";

  const before = await beforeRead(core, s, name, docs, operation);

  await populate(await databaseForScope(core, s), collections, fields, before, plan, {
    richtext: (values) => resolveRichtext(core, s, values),
    drafts,
    loc: (collection) => locOf(core, s, collections[collection]),
    access: (collection) => readDecision(core, s, collectionTarget(collection)),
    // Populated documents run their own collection's read hooks, in the scope of the outer read.
    before: (collection, docs) => beforeRead(core, s, collectionTarget(collection), docs, "read"),
    after: (collection, docs) => afterRead(core, s, collectionTarget(collection), docs, "read"),
    media:
      media &&
      ((doc, field) => decorate(media, doc, field.type === "image" ? field.image : undefined)),
  });

  let result = await afterRead(core, s, name, before, operation);
  if (media && isMedia(name)) result = result.map((d) => decorate(media, d));
  if (alternates && name.kind === "collection" && (!select || select.alternates))
    result = await addAlternates(core, s, name.name, result);

  return select ? result.map((d) => pick(collections, fields, d, select)) : result;
}

/**
 * Builds the populate plan of read options and checks `select` against the fields and what `populate` resolves.
 * `doc` is false for globals, which have no meta keys.
 *
 * @returns The populate plan and the checked `select`.
 * @throws {Error} For a `select` path that does not fit.
 */
export function readPlan(
  core: Core,
  fields: Fields,
  options: ReadOpts,
  meta: readonly string[] | false = metaKeys(),
) {
  const plan = toPopulatePlan(options, core.populate.depth);
  const select = options.select as SelectSpec | undefined;

  const error = select && badSelectPath(core.schema.collections, fields, select, plan, "", meta);
  if (error) throw new Error(`Invalid select: ${error}`);

  return { plan, select };
}
