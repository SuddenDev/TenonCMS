import { consola } from "consola";
import type { Core, Scope } from "../../../cms/runtime/types.ts";
import { databaseForScope } from "../../../cms/runtime/transaction.ts";
import { mediaOf } from "../../runtime/create-media-core.ts";
import { type Row, deleteUpload } from "./upload-row.ts";

const log = consola.withTag("integral");

/** Step 4: drops an unfinished upload in storage and deletes its row. */
export async function abort(core: Core, scope: Scope, row: Row) {
  await mediaOf(core).storage.abort(row.key, row.adapter_upload_id);
  await deleteUpload(await databaseForScope(core, scope), row.id);
}

/** Drops an assembled file and its upload row after a failed `complete`. A failed file delete is logged. */
export async function discard(core: Core, scope: Scope, row: Row) {
  await mediaOf(core)
    .storage.delete(row.key)
    .catch((e) => log.error(e));
  await deleteUpload(await databaseForScope(core, scope), row.id);
}
