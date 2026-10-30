import type { Db, Holds } from "../document-sql.ts";

/** Documents of `collection` whose published data `holds`, as `{ id, data }` with the raw JSON. */
export const referencingDocs = (db: Db, collection: string, holds: Holds) =>
  db
    .selectFrom("cms_documents")
    .select(["id", "data"])
    .where("collection", "=", collection)
    .where(holds("data"))
    .execute();
