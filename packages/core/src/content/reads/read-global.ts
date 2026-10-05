import { loadGlobal } from "../../db/queries/globals/load-global.query.ts";
import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { glob } from "../targets.ts";
import { q } from "../../cms/runtime/transaction.ts";
import { type ReadOpts } from "./read-documents.ts";
import { readDocs, readPlan } from "./read-results.ts";

/**
 * Reads a global for `getGlobal`.
 * @returns The global after read hooks, population and `select`. Fields that were never saved are missing.
 */
export async function readGlobal(core: Core, s: Inner, name: string, options: ReadOpts) {
  const { plan, select } = readPlan(core, core.schema.globals[name].fields, options, false);

  const stored = await loadGlobal(await q(core, s), name, s.perspective === "drafts");
  const data = stored ?? { publishedAt: null, hasDraft: false };

  return (await readDocs(core, s, glob(name), [data], plan, select))[0];
}
