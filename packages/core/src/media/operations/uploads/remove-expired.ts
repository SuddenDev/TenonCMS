import { consola } from "consola";
import type { Kysely } from "kysely";
import type { Database } from "../../../db/types.ts";
import type { Storage } from "../../storage/types.ts";
import { DAY, deleteUpload } from "./upload-row.ts";

const log = consola.withTag("tenon");

/** Aborts uploads older than a day and deletes their rows. A failed abort is logged; the row goes anyway. */
export async function removeExpired(storage: Storage, db: Kysely<Database>) {
  const expired = await db
    .selectFrom("cms_uploads")
    .selectAll()
    .where("created_at", "<", Date.now() - DAY)
    .execute();

  for (const row of expired) {
    await storage.abort(row.key, row.adapter_upload_id).catch((e) => log.error(e));
    await deleteUpload(db, row.id);
  }
}
