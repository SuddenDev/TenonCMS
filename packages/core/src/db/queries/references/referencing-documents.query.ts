import { type Db, holds } from "../document-sql.ts";

/** Documents of `collection` whose relation at `path` holds `id`, as `{ id, data }` with the raw JSON. Reads published data. */
export function referencingDocs(
  db: Db,
  collection: string,
  path: string,
  many: boolean | undefined,
  id: string,
) {
  return db
    .selectFrom("cms_documents")
    .select(["id", "data"])
    .where("collection", "=", collection)
    .where(holds(path, many, id))
    .execute();
}
