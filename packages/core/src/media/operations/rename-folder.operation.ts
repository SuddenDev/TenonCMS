import type { Core, Scope } from "../../cms/runtime/types.ts";
import { q } from "../../cms/runtime/transaction.ts";
import { findDocs } from "../../db/queries/documents/find-documents.query.ts";
import { ValidationError } from "../../errors.ts";
import { cleanFolder } from "../library/names.ts";
import { update } from "./update.operation.ts";

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
