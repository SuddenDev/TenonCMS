import type { Core, Scope } from "../../../cms/runtime/types.ts";
import { q } from "../../../cms/runtime/transaction.ts";
import { mediaOf } from "../../runtime/create-media-core.ts";
import type { Row } from "./upload-data.ts";

/** Step 4: drops an unfinished upload. */
export async function abort(core: Core, scope: Scope, row: Row) {
  await mediaOf(core).storage.abort(row.key, row.adapter_upload_id);
  await (await q(core, scope)).deleteFrom("cms_uploads").where("id", "=", row.id).execute();
}
