import { consola } from "consola";
import type { Db } from "../../../db/types.ts";
import type { Storage } from "../../storage/types.ts";
import { deleteUpload } from "../../../db/queries/uploads/delete-upload.query.ts";
import { uploadsCreatedBefore } from "../../../db/queries/uploads/uploads-created-before.query.ts";
import { DAY } from "./upload-row.ts";

const log = consola.withTag("tenon");

/**
 * Aborts uploads older than a day, deletes a file already assembled at their key, and deletes their rows. Such a
 * file has no document: completing a media upload deletes its row in the same transaction. A failure is logged; the
 * row goes anyway.
 */
export async function removeExpired(storage: Storage, db: Db) {
  const expired = await uploadsCreatedBefore(db, Date.now() - DAY);

  for (const row of expired) {
    await storage.abort(row.key, row.adapter_upload_id).catch((e) => log.error(e));
    await storage.delete(row.key).catch((e) => log.error(e));
    await deleteUpload(db, row.id);
  }
}
