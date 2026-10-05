import { type Db, type DocData, dataOf, visible } from "../document-sql.ts";
import { withMeta } from "../../map-document.ts";
import { sql } from "kysely";

/** The data of a global with `publishedAt` and `hasDraft`, or `undefined` if the perspective does not see it. */
export async function loadGlobal(db: Db, name: string, drafts = false) {
  const row = await db
    .selectFrom("cms_globals")
    .select(["published_at", sql<number>`draft IS NOT NULL`.as("has_draft")])
    .select(sql<string>`${sql.raw(dataOf(drafts))}`.as("data"))
    .where("name", "=", name)
    .where(visible(drafts))
    .executeTakeFirst();
  return row && (withMeta(row) as DocData);
}
