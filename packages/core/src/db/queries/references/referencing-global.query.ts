import { type Db, holdsAt } from "../document-sql.ts";
import type { Step } from "../../../schema/traversal/relation-paths.ts";

/** The raw JSON of global `name` if its relation at `path` holds `id`. Reads published data. */
export async function referencingGlobal(
  db: Db,
  name: string,
  path: Step[],
  many: boolean | undefined,
  id: string,
) {
  const row = await db
    .selectFrom("cms_globals")
    .select("data")
    .where("name", "=", name)
    .where(holdsAt(db, "data", path, many, id))
    .executeTakeFirst();
  return row?.data;
}
