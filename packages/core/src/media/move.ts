import { consola } from "consola";
import { col, type Core, inner, q, type Scope } from "../cms/scope.ts";
import { remove, write } from "../cms/write.ts";
import { findDocs, loadDoc } from "../db/documents.ts";
import { ValidationError } from "../errors.ts";
import { runHooks } from "../schema/hooks/run.ts";
import type { MediaDoc, MediaUpdate } from "../schema/index.ts";
import { mediaSlot } from "./index.ts";
import { cleanFolder, cleanName, keyOf } from "./names.ts";
import { mediaArgs, mediaOf, namesIn, read, tx, variantKey, variantsOf } from "./upload.ts";

const log = consola.withTag("integral");

// Order for every operation: storage first, then the database, then storage cleanup. A failure leaves at most a
// stray object in storage, never a document that points to a missing file.

// Moves a file and its variants. A variant that fails to move is logged; it renders again on request.
async function moveFiles(core: Core, from: string, to: string) {
  const { storage } = mediaOf(core);
  await storage.move(from, to);
  await Promise.all(
    (await variantsOf(storage, from)).map((id) =>
      storage.move(variantKey(from, id), variantKey(to, id)).catch((e) => log.error(e)),
    ),
  );
}

/**
 * `cms.media.update()`: `alt` runs the change hooks; a new `filename` or `folder` moves the file.
 * A move never renames on a collision: a taken name is 400 `Already used`.
 */
export async function update(core: Core, scope: Scope, id: string, input: MediaUpdate) {
  const original = (await loadDoc(await q(core, scope), "media", id)) as MediaDoc | undefined;
  if (!original) return undefined;
  const folder = input.folder === undefined ? original.folder : cleanFolder(input.folder);
  const filename = input.filename === undefined ? original.filename : cleanName(input.filename);
  const from = original.key;
  const to = keyOf(folder, filename);
  let moved = false;

  // ponytail: two concurrent moves of the same file are not locked. Add a per-document lock if editors collide.
  try {
    const doc = await tx(core, scope, async (s) => {
      const slot = (stage: Parameters<typeof mediaSlot>[1]) => mediaSlot(core, stage);
      const data: Record<string, unknown> = { ...original };
      if (input.alt !== undefined) {
        const changed = await runHooks(
          slot("beforeChange"),
          "data",
          { alt: input.alt },
          mediaArgs(s, { originalDoc: original }),
        );
        data.alt = changed.alt;
      }
      if (to !== from) {
        const taken = (await namesIn(s.trx!, folder)).filter(
          (n) => !(folder === original.folder && n === original.filename),
        );
        if (taken.some((n) => n.toLowerCase() === filename.toLowerCase()))
          throw new ValidationError({ filename: "Already used" });
        await runHooks(slot("beforeMove"), "doc", original, mediaArgs(s, { from, to }));
        await moveFiles(core, from, to);
        moved = true;
        Object.assign(data, { folder, filename, key: to });
      }
      const doc = (await write(core, s, col("media"), "update", data, { id }))!;
      if (moved) await runHooks(slot("afterMove"), "doc", doc, mediaArgs(s, { from, to }));
      if (input.alt !== undefined)
        await runHooks(slot("afterChange"), "doc", doc, mediaArgs(s, { previousDoc: original }));
      return doc;
    });
    return read(core, doc);
  } catch (error) {
    if (moved)
      await moveFiles(core, to, from).catch((e) =>
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
  const media = mediaOf(core);
  const doc = (await loadDoc(await q(core, scope), "media", id)) as MediaDoc | undefined;
  if (!doc) return;
  await tx(core, scope, async (s) => {
    await runHooks(mediaSlot(core, "beforeDelete"), "doc", doc, mediaArgs(s, {}));
    await remove(core, s, "media", id);
  });
  const variants = await variantsOf(media.storage, doc.key).catch(() => []);
  await Promise.all(
    [doc.key, ...variants.map((id) => variantKey(doc.key, id))].map((key) =>
      media.storage.delete(key).catch((e) => log.error(`Deleting "${key}" failed`, e)),
    ),
  );
  const context = scope.nested ? scope.context : {};
  await runHooks(
    mediaSlot(core, "afterDelete"),
    "doc",
    doc,
    mediaArgs(inner(core, scope, scope.trx, context), {}),
  );
}
