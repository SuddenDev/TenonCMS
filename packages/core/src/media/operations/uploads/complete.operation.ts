import { col } from "../../../content/targets.ts";
import type { Core, Inner, Scope } from "../../../cms/runtime/types.ts";
import { transaction } from "../../../cms/runtime/transaction.ts";
import { write } from "../../../content/writes/write-document.ts";
import { hasVariants } from "../../images/decorate.ts";
import { mediaOf } from "../../runtime/create-media-core.ts";
import { readMedia } from "../../runtime/read-media.ts";
import { runMediaHooks } from "../../runtime/run-media-hooks.ts";
import { renderAll } from "../../variants/render-variants.ts";
import { discard } from "./abort.operation.ts";
import { fileData } from "./file-data.ts";
import { type Row, deleteUpload } from "./upload-row.ts";

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

  if (media.images?.provider.prerender && hasVariants(media.images, doc)) {
    await renderAll(media, doc.key, media.allowlist.keys());
  }

  return readMedia(core, doc);
}

// Creates the document, runs `afterUpload` and deletes the upload row.
async function createDoc(core: Core, s: Inner, row: Row, data: Record<string, unknown>) {
  const { storage } = mediaOf(core);
  const doc = (await write(core, s, col("media"), "create", data))!;

  const read = async () => (await storage.get(row.key))!.body;
  await runMediaHooks(core, s, "afterUpload", "doc", doc, { read });

  await deleteUpload(s.trx!, row.id);
  return doc;
}
