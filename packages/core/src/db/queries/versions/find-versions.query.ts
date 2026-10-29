import { type RawBuilder, sql } from "kysely";
import type { Db } from "../document-sql.ts";
import { iso } from "../../map-document.ts";
import type { Version, VersionWithData } from "../../../versions/types.ts";

type VersionRow = {
  id: string;
  status: Version["status"];
  locale: string | null;
  data: string;
  created_by: string | null;
  name: string | null;
  created_at: number;
  updated_at: number;
};

const select = (db: Db, target: string, docId: string, where: RawBuilder<unknown>) =>
  sql<VersionRow>`SELECT v.id, v.status, v.locale, v.data, v.created_by, "user".name, v.created_at, v.updated_at
    FROM cms_versions v LEFT JOIN "user" ON "user".id = v.created_by
    WHERE v.target = ${target} AND v.doc_id = ${docId} AND ${where}
    ORDER BY v.created_at DESC, v.rowid DESC`.execute(db);

const toVersion = (r: VersionRow): Version => ({
  id: r.id,
  status: r.status,
  locale: r.locale,
  user: r.created_by === null ? null : { id: r.created_by, name: r.name ?? "" },
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

/** The versions of a document or global in one locale, newest first, with the name of their user. */
export async function findVersions(db: Db, target: string, docId: string, locale: string | null) {
  const { rows } = await select(db, target, docId, sql`v.locale IS NOT DISTINCT FROM ${locale}`);
  return rows.map(toVersion);
}

/** One version with its data. `undefined` when it belongs to another document or global. */
export async function findVersion(
  db: Db,
  target: string,
  docId: string,
  id: string,
): Promise<VersionWithData | undefined> {
  const { rows } = await select(db, target, docId, sql`v.id = ${id}`);
  return rows[0] && { ...toVersion(rows[0]), data: JSON.parse(rows[0].data) };
}
