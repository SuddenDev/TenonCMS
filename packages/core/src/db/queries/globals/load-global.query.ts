import {
  type Db,
  type DocData,
  type Loc,
  GLOBAL_LOCALES,
  SHARED_DRAFT,
  dataOf,
  localeJoins,
  visible,
} from "../document-sql.ts";
import { localeMeta, withMeta } from "../../map-document.ts";
import { type LocaleColumns } from "../../types.ts";
import { sql } from "kysely";

type GlobalRow = {
  updated_at: number;
  published_at: number | null;
  has_draft: number;
  data: string;
  locales: string;
} & Partial<LocaleColumns>;

/**
 * The data of a global with `updatedAt`, `publishedAt` and `hasDraft`, or `undefined` if the perspective does not see it.
 * A localized `loc` merges the locale rows into the data and adds `locale` and `locales`: the published locales, or
 * every locale with a row in the drafts perspective.
 */
export async function loadGlobal(db: Db, name: string, drafts = false, loc?: Loc) {
  if (!loc) {
    const row = await db
      .selectFrom("cms_globals")
      .select(["updated_at", "published_at", sql<number>`draft IS NOT NULL`.as("has_draft")])
      .select(sql<string>`${sql.raw(dataOf(drafts))}`.as("data"))
      .where("name", "=", name)
      .where(visible(drafts))
      .executeTakeFirst();
    return row && (withMeta(row) as DocData);
  }

  const { rows } = await sql<GlobalRow>`
    SELECT cms_globals.updated_at AS updated_at, cms_globals.published_at AS published_at, cms_globals.draft IS NOT NULL AS has_draft,
      ${sql.raw(dataOf(drafts, "cms_globals."))} AS data,
      ${sql.raw(dataOf(drafts, "lr."))} AS r_data, ${sql.raw(dataOf(drafts, "ld."))} AS d_data,
      ${sql.raw(SHARED_DRAFT("cms_globals."))} AS shared_draft,
      lr.updated_at AS r_updated_at, lr.published_at AS r_published_at, lr.draft IS NOT NULL AS r_has_draft,
      ld.published_at AS d_published_at, ld.draft IS NOT NULL AS d_has_draft,
      (SELECT json_group_array(locale) FROM cms_global_locales
        WHERE name = cms_globals.name ${sql.raw(drafts ? "" : "AND published_at IS NOT NULL")}) AS locales
    FROM cms_globals ${localeJoins(drafts, loc, GLOBAL_LOCALES, "cms_globals.name")}
    WHERE cms_globals.name = ${name} AND ${visible(drafts, "", loc)}`.execute(db);
  return (
    rows[0] &&
    ({
      ...withMeta(rows[0], loc),
      ...localeMeta(loc, rows[0].locales, rows[0].shared_draft),
    } as DocData)
  );
}
