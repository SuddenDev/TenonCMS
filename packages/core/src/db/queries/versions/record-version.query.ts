import { sql } from "kysely";
import type { Db, DocData } from "../document-sql.ts";

/** After this long without a draft save, the next one starts a new version. */
const DRAFT_BREAK = 30 * 60_000;
const MAX_VERSIONS = 100;

type Recorded = {
  target: string;
  docId: string;
  locale: string | null;
  status: "draft" | "published";
  data: DocData;
  by: string | null;
  /** The most versions kept for this document and locale. Default `MAX_VERSIONS`. */
  max?: number;
};

/**
 * Inserts a version. A draft updates the newest version instead when that one is a draft by the same user in the same
 * locale, saved within `DRAFT_BREAK`, so autosaves do not add a row each. An insert deletes the oldest versions
 * beyond `max`.
 */
export async function recordVersion(db: Db, v: Recorded) {
  const now = Date.now();
  const data = JSON.stringify(v.data);

  if (v.status === "draft") {
    const { rows } = await sql<{
      id: string;
      status: string;
      created_by: string | null;
      updated_at: number;
    }>`
      SELECT id, status, created_by, updated_at FROM cms_versions
      WHERE target = ${v.target} AND doc_id = ${v.docId} AND locale IS NOT DISTINCT FROM ${v.locale}
      ORDER BY created_at DESC, rowid DESC LIMIT 1`.execute(db);
    const last = rows[0];
    if (
      last?.status === "draft" &&
      last.created_by === v.by &&
      last.updated_at > now - DRAFT_BREAK
    ) {
      await db
        .updateTable("cms_versions")
        .set({ data, updated_at: now })
        .where("id", "=", last.id)
        .execute();
      return;
    }
  }

  await db
    .insertInto("cms_versions")
    .values({
      id: crypto.randomUUID(),
      target: v.target,
      doc_id: v.docId,
      locale: v.locale,
      status: v.status,
      data,
      created_by: v.by,
      created_at: now,
      updated_at: now,
    })
    .execute();

  const max = v.max ?? MAX_VERSIONS;
  if (Number.isFinite(max)) {
    const same = sql`target = ${v.target} AND doc_id = ${v.docId} AND locale IS NOT DISTINCT FROM ${v.locale}`;
    await sql`
      DELETE FROM cms_versions WHERE ${same} AND id NOT IN (
        SELECT id FROM cms_versions WHERE ${same} ORDER BY created_at DESC, rowid DESC LIMIT ${max})`.execute(
      db,
    );
  }
}
