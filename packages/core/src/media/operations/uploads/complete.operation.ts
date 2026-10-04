import { consola } from "consola";
import { col } from "../../../content/targets.ts";
import type { Core, Inner, Scope } from "../../../cms/runtime/types.ts";
import { q, transaction } from "../../../cms/runtime/transaction.ts";
import { write } from "../../../content/writes/write-document.ts";
import { ValidationError } from "../../../errors.ts";
import { mediaOf } from "../../runtime/create-media-core.ts";
import { read } from "../../runtime/read-media.ts";
import { runMediaHooks } from "../../runtime/run-media-hooks.ts";
import { dimensions } from "../../images/dimensions.ts";
import { hasVariants } from "../../images/decorate.ts";
import type { Storage } from "../../storage/types.ts";
import { renderAll } from "../../variants/render-all.ts";
import type { Row } from "./upload-data.ts";

const log = consola.withTag("integral");

// Bytes read for the image header. Some JPEGs carry large metadata before their size.
const HEADER = 1024 ** 2;

// Drops the stored file and the upload row after a failed `complete`.
async function discard(core: Core, scope: Scope, row: Row) {
  await mediaOf(core)
    .storage.delete(row.key)
    .catch((e) => log.error(e));
  await (await q(core, scope)).deleteFrom("cms_uploads").where("id", "=", row.id).execute();
}

// The document data of a stored upload. Throws when the size is off or an image has no readable header.
async function fileData(storage: Storage, row: Row, size: number) {
  if (size !== row.size)
    throw new ValidationError({ size: `Received ${size} bytes, expected ${row.size}` });
  const data = {
    folder: row.folder,
    filename: row.filename,
    key: row.key,
    mimeType: row.mime_type,
    size,
  };
  if (!row.mime_type.startsWith("image/")) return data;
  const head = await storage.get(row.key, { start: 0, end: Math.min(size, HEADER) - 1 });
  const found = head && dimensions(await new Response(head.body).bytes());
  if (!found) throw new ValidationError({ "": "Not a valid image" });
  return { ...data, ...found };
}

// Creates the document, runs `afterUpload` and deletes the upload row.
async function createDoc(core: Core, s: Inner, row: Row, data: Record<string, unknown>) {
  const { storage } = mediaOf(core);
  const doc = (await write(core, s, col("media"), "create", data))!;
  const readFile = async () => (await storage.get(row.key))!.body;
  await runMediaHooks(core, s, "afterUpload", "doc", doc, { read: readFile });
  await s.trx!.deleteFrom("cms_uploads").where("id", "=", row.id).execute();
  return doc;
}

/**
 * Step 3: assembles the file, checks its size and image header, then creates the document, runs `afterUpload` and deletes
 * the upload row in one transaction. On failure the file and the row go. Renders variants after commit when the
 * provider prerenders; a failed variant is logged and renders on first request instead.
 */
export async function complete(
  core: Core,
  scope: Scope,
  row: Row,
  parts: { n: number; etag: string }[],
) {
  const media = mediaOf(core);
  const { size } = await media.storage.complete(row.key, row.adapter_upload_id, parts);
  let doc: Record<string, any>;
  try {
    const data = await fileData(media.storage, row, size);
    doc = await transaction(core, scope, (s) => createDoc(core, s, row, data));
  } catch (error) {
    await discard(core, scope, row);
    throw error;
  }
  if (media.images?.provider.prerender && hasVariants(media.images, doc))
    await renderAll(media, doc.key, media.allowlist.keys());
  return read(core, doc);
}
