import { loadGlobal } from "../../db/queries/globals/load-global.query.ts";
import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { globalTarget } from "../targets.ts";
import { databaseForScope } from "../../cms/runtime/transaction.ts";
import { type ReadOpts } from "./read-documents.ts";
import { readDocs, readPlan } from "./read-results.ts";
import { globalMetaKeys } from "../population/validate-select.ts";
import { localeMeta } from "../../db/map-document.ts";
import { locOf } from "./loc-of.ts";
import { enforce } from "../../access/rule.ts";
import { readDecision } from "../../access/read.ts";

/**
 * Reads a global for `getGlobal`.
 * @returns The global after read hooks, population and `select`. Fields that were never saved are missing.
 * @throws {ForbiddenError} When the read rule denies.
 */
export async function readGlobal(core: Core, s: Inner, name: string, options: ReadOpts) {
  const entry = core.schema.globals[name];
  enforce(s, await readDecision(core, s, globalTarget(name)));
  const { plan, select } = readPlan(core, entry.fields, options, globalMetaKeys(entry.localized));
  const loc = await locOf(core, s, globalTarget(name));

  const stored = await loadGlobal(
    await databaseForScope(core, s),
    name,
    s.perspective === "drafts",
    loc,
  );
  const data = stored ?? {
    publishedAt: null,
    hasDraft: false,
    ...(loc && localeMeta(loc, null)),
    ...(loc &&
      Object.keys(loc.structure).length && {
        syncStructure: loc.syncDefault,
        syncStructureDefault: true,
      }),
  };

  return (await readDocs(core, s, globalTarget(name), [data], plan, select))[0];
}
