import { loadGlobal } from "../../db/queries/globals/load-global.query.ts";
import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { glob } from "../targets.ts";
import { q } from "../../cms/runtime/transaction.ts";
import { type ReadOpts } from "./read-documents.ts";
import { readDocs, readPlan } from "./read-results.ts";
import { globalMetaKeys } from "../population/validate-select.ts";
import { localeMeta } from "../../db/map-document.ts";
import { locOf } from "./loc-of.ts";

/**
 * Reads a global for `getGlobal`.
 * @returns The global after read hooks, population and `select`. Fields that were never saved are missing.
 */
export async function readGlobal(core: Core, s: Inner, name: string, options: ReadOpts) {
  const entry = core.schema.globals[name];
  const { plan, select } = readPlan(core, entry.fields, options, globalMetaKeys(entry.localized));
  const loc = locOf(core, s, entry);

  const stored = await loadGlobal(await q(core, s), name, s.perspective === "drafts", loc);
  const data = stored ?? { publishedAt: null, hasDraft: false, ...(loc && localeMeta(loc, null)) };

  return (await readDocs(core, s, glob(name), [data], plan, select))[0];
}
