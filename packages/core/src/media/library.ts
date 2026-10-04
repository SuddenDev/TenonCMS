import { consola } from "consola";
import type { Kysely } from "kysely";
import { col } from "../content/targets.ts";
import { contextOf, inner } from "../cms/runtime/operation-context.ts";
import { type Core, type Scope } from "../cms/runtime/types.ts";
import { q, transaction } from "../cms/runtime/transaction.ts";
import { remove } from "../content/writes/remove-document.ts";
import { write } from "../content/writes/write-document.ts";
import { distinct } from "../db/queries/media/distinct-values.query.ts";
import { findDocs } from "../db/queries/documents/find-documents.query.ts";
import { loadDoc } from "../db/queries/documents/load-document.query.ts";
import type { Database } from "../db/types.ts";
import { ValidationError } from "../errors.ts";
import type { MediaDoc, MediaUpdate } from "../schema/index.ts";
import { mediaOf, read, runMediaHooks } from "./core.ts";
import { cleanFolder, cleanName, keyOf } from "./names.ts";
import { deleteWithVariants, moveWithVariants } from "./variants.ts";

const log = consola.withTag("integral");

// Order for every operation: storage first, then the database, then storage cleanup. A failure leaves at most a
// stray object in storage, never a document that points to a missing file.

/** Filenames used in `folder`, by media documents and by uploads in progress. */
export async function namesIn(db: Kysely<Database>, folder: string) {
  // ponytail: loads every document of the folder. Add a SQL filter on filename if folders grow large.
  const docs = await findDocs(db, "media", { where: { folder } });
  const uploads = await db
    .selectFrom("cms_uploads")
    .select("filename")
    .where("folder", "=", folder)
    .execute();
  return [...docs.map((d) => String(d.filename)), ...uploads.map((u) => u.filename)];
}

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

/** `cms.media.renameFolder()`: moves every file under `from` to `to`, one by one. Running it again finishes a partial rename. */
export async function renameFolder(core: Core, scope: Scope, fromInput: string, toInput: string) {
  const from = cleanFolder(fromInput);
  const to = cleanFolder(toInput);
  if (!from) throw new ValidationError({ from: "Invalid folder" });
  if (to === from || to.startsWith(`${from}/`))
    throw new ValidationError({ to: "Cannot move a folder into itself" });
  // ponytail: loads every media document. Add a SQL prefix filter if libraries grow large.
  const docs = (await findDocs(await q(core, scope), "media", {})).filter(
    (d) => d.folder === from || String(d.folder).startsWith(`${from}/`),
  );
  const failed: { id: string; message: string }[] = [];
  for (const doc of docs) {
    const folder = [to, doc.folder.slice(from.length + 1)].filter(Boolean).join("/");
    try {
      await update(core, scope, doc.id, { folder });
    } catch (error) {
      failed.push({ id: doc.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { moved: docs.length - failed.length, failed };
}

/**
 * `cms.media.delete()`: `beforeDelete` and the document delete with its `onDelete` rules in one transaction, then the file
 * and its variants, then `afterDelete`. A failed storage delete is logged; the delete still succeeds.
 */
export async function removeMedia(core: Core, scope: Scope, id: string) {
  const doc = (await loadDoc(await q(core, scope), "media", id)) as MediaDoc | undefined;
  if (!doc) return;
  await transaction(core, scope, async (s) => {
    await runMediaHooks(core, s, "beforeDelete", "doc", doc);
    await remove(core, s, "media", id);
  });
  await deleteWithVariants(mediaOf(core).storage, doc.key);
  const outside = inner(core, scope, scope.trx, contextOf(scope));
  await runMediaHooks(core, outside, "afterDelete", "doc", doc);
}

/** All folders of the library with their parents, sorted. The root `''` is left out. */
export async function folders(core: Core) {
  const set = new Set<string>();
  for (const folder of await distinct(await core.db(), "media", "folder")) {
    const parts = String(folder ?? "").split("/");
    for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join("/"));
  }
  set.delete("");
  return [...set].sort();
}
