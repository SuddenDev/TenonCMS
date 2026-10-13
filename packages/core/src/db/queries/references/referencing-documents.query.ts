import { type Db, holdsAt } from "../document-sql.ts";
import type { Step } from "../../../schema/traversal/relation-paths.ts";

/** Documents of `collection` whose relation at `path` holds `id`, as `{ id, data }` with the raw JSON. Reads published data. */
export const referencingDocs = (
  db: Db,
  collection: string,
  path: Step[],
  many: boolean | undefined,
  id: string,
) =>
  db
    .selectFrom("cms_documents")
    .select(["id", "data"])
    .where("collection", "=", collection)
    .where(holdsAt("data", path, many, id))
    .execute();
