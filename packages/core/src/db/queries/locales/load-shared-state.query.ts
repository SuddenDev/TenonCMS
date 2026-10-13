import { sql } from "kysely";
import { type Db, type DocData, SHARED_DRAFT } from "../document-sql.ts";

/**
 * The shared row of a document or global, whatever its publication state: its pending data (`draft`, else `data`) and
 * whether the draft differs from the published data. `owner` is the document id or the global name.
 * @returns The state, or `undefined` when the row does not exist.
 */
export async function loadSharedState(
  db: Db,
  target: { kind: "collection" | "global"; name: string },
  owner: string,
): Promise<{ pending: DocData; differs: boolean } | undefined> {
  const global = target.kind === "global";
  const { rows } = await sql<{ pending: string; differs: number }>`
    SELECT COALESCE(draft, data) AS pending, ${sql.raw(SHARED_DRAFT(""))} AS differs
    FROM ${sql.table(global ? "cms_globals" : "cms_documents")}
    WHERE ${global ? sql`name = ${owner}` : sql`collection = ${target.name} AND id = ${owner}`}`.execute(
    db,
  );
  return rows[0] && { pending: JSON.parse(rows[0].pending), differs: Boolean(rows[0].differs) };
}
