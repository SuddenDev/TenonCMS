import { type Db, holds } from "../document-sql.ts";

/** The raw JSON of global `name` if its relation at `path` holds `id`. Reads published data. */
export async function referencingGlobal(
  db: Db,
  name: string,
  path: string,
  many: boolean | undefined,
  id: string,
) {
  const row = await db
    .selectFrom("cms_globals")
    .select("data")
    .where("name", "=", name)
    .where(holds(path, many, id))
    .executeTakeFirst();
  return row?.data;
}
