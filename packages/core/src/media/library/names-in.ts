import type { Core, Scope, Inner } from "../../cms/runtime/types.ts";
import { databaseForScope, onRollback } from "../../cms/runtime/transaction.ts";
import { findDocs } from "../../db/queries/documents/find-documents.query.ts";

type Place = { folder: string; filename: string };
const pendingDeletes = new WeakMap<Core, Set<Place>>();

/** Reserves pending deletion bytes across scopes. Rollback releases automatically; commit cleanup MUST release before hooks. */
export function reserveDeletedKey(core: Core, scope: Inner, place: Place) {
  const reserved = pendingDeletes.get(core) ?? new Set<Place>();
  const reservation = { folder: place.folder, filename: place.filename };
  reserved.add(reservation);
  pendingDeletes.set(core, reserved);

  const release = () => {
    reserved.delete(reservation);
  };
  onRollback(scope, async () => release());
  return release;
}

/** Filenames used by documents, unfinished uploads and deletions awaiting the outer commit. */
export async function namesIn(core: Core, scope: Scope, folder: string) {
  const db = await databaseForScope(core, scope);
  // shortcut: loads every document of the folder, add a SQL filename filter if folders grow large.
  const docs = await findDocs(db, "media", { where: { folder } });
  const uploads = await db
    .selectFrom("cms_uploads")
    .select("filename")
    .where("folder", "=", folder)
    .execute();
  const reserved = [...(pendingDeletes.get(core) ?? [])];

  return [
    ...docs.map((doc) => String(doc.filename)),
    ...uploads.map((upload) => upload.filename),
    ...reserved.filter((place) => place.folder === folder).map((place) => place.filename),
  ];
}
