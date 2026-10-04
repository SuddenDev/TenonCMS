import { type Db, json } from "../document-sql.ts";
import { sql } from "kysely";

/** Whether another document of `collection` stores `value` under `key`. Scans published data only. */
export async function taken(
  db: Db,
  collection: string,
  key: string,
  value: unknown,
  exceptId?: string,
) {
  let query = db
    .selectFrom("cms_documents")
    .select("id")
    .where("collection", "=", collection)
    .where(sql<boolean>`${json(key)} = ${value}`);
  if (exceptId) query = query.where("id", "!=", exceptId);
  return Boolean(await query.executeTakeFirst());
}
