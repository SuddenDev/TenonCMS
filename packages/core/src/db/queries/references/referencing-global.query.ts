import type { Db, Holds } from "../document-sql.ts";

/** The raw JSON of global `name` if its published data `holds`. */
export async function referencingGlobal(db: Db, name: string, holds: Holds) {
  const row = await db
    .selectFrom("cms_globals")
    .select("data")
    .where("name", "=", name)
    .where(holds("data"))
    .executeTakeFirst();
  return row?.data;
}
