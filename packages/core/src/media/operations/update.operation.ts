import { consola } from "consola";
import type { Kysely } from "kysely";
import { col } from "../../content/targets.ts";
import type { Core, Scope } from "../../cms/runtime/types.ts";
import { q, transaction } from "../../cms/runtime/transaction.ts";
import { write } from "../../content/writes/write-document.ts";
import { loadDoc } from "../../db/queries/documents/load-document.query.ts";
import type { Database } from "../../db/types.ts";
import { ValidationError } from "../../errors.ts";
import type { MediaDoc, MediaUpdate } from "../../schema/index.ts";
import { mediaOf } from "../runtime/create-media-core.ts";
import { read } from "../runtime/read-media.ts";
import { runMediaHooks } from "../runtime/run-media-hooks.ts";
import { cleanFolder, cleanName, keyOf } from "../library/names.ts";
import { moveWithVariants } from "../variants/move-variants.ts";
import { namesIn } from "../library/names-in.ts";

const log = consola.withTag("integral");

// Throws `Already used` when another file in `folder` has `filename`, case-insensitive.
async function checkFree(db: Kysely<Database>, folder: string, filename: string, self: MediaDoc) {
  const taken = (await namesIn(db, folder)).filter(
    (n) => !(folder === self.folder && n === self.filename),
  );
  if (taken.some((n) => n.toLowerCase() === filename.toLowerCase()))
    throw new ValidationError({ filename: "Already used" });
}

/**
 * `cms.media.update()`: `alt` runs the change hooks; a new `filename` or `folder` moves the file.
 * A move never renames on a collision: a taken name is 400 `Already used`.
 */
export async function update(core: Core, scope: Scope, id: string, input: MediaUpdate) {
  const { storage } = mediaOf(core);
  const original = (await loadDoc(await q(core, scope), "media", id)) as MediaDoc | undefined;
  if (!original) return undefined;
  const folder = input.folder === undefined ? original.folder : cleanFolder(input.folder);
  const filename = input.filename === undefined ? original.filename : cleanName(input.filename);
  const from = original.key;
  const to = keyOf(folder, filename);
  const altChanged = input.alt !== undefined;
  let moved = false;

  // ponytail: two concurrent moves of the same file are not locked. Add a per-document lock if editors collide.
  try {
    const doc = await transaction(core, scope, async (s) => {
      const data: Record<string, unknown> = { ...original };
      if (altChanged) {
        const extra = { originalDoc: original };
        const changed = await runMediaHooks(
          core,
          s,
          "beforeChange",
          "data",
          { alt: input.alt },
          extra,
        );
        data.alt = changed.alt;
      }
      if (to !== from) {
        await checkFree(s.trx!, folder, filename, original);
        await runMediaHooks(core, s, "beforeMove", "doc", original, { from, to });
        await moveWithVariants(storage, from, to);
        moved = true;
        Object.assign(data, { folder, filename, key: to });
      }
      const doc = (await write(core, s, col("media"), "update", data, { id }))!;
      if (moved) await runMediaHooks(core, s, "afterMove", "doc", doc, { from, to });
      if (altChanged)
        await runMediaHooks(core, s, "afterChange", "doc", doc, { previousDoc: original });
      return doc;
    });
    return read(core, doc);
  } catch (error) {
    if (moved)
      await moveWithVariants(storage, to, from).catch((e) =>
        log.error(`Moving "${to}" back to "${from}" failed. The document points to "${from}".`, e),
      );
    throw error;
  }
}
