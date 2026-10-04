import { loadGlobal } from "../../db/queries/globals/load-global.query.ts";
import { type Core, type Inner } from "../../cms/runtime/types.ts";
import { glob } from "../targets.ts";
import { q } from "../../cms/runtime/transaction.ts";
import { type ReadOpts } from "./read-documents.ts";
import { readDocs, readSpec } from "./read-results.ts";

/** `getGlobal`. Fields that were never saved are missing. */
export async function readGlobal(core: Core, s: Inner, name: string, options: ReadOpts) {
  const { spec, select } = readSpec(core, core.schema.globals[name].fields, options, false);
  const data = (await loadGlobal(await q(core, s), name, s.drafts)) ?? {
    publishedAt: null,
    hasDraft: false,
  };
  return (await readDocs(core, s, glob(name), [data], spec, select))[0];
}
