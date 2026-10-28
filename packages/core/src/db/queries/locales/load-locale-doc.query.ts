import { sql } from "kysely";
import { mergeLocale } from "../../../content/reads/merge-locale.ts";
import {
  type Db,
  type DocData,
  type Loc,
  GLOBAL_LOCALES,
  DOCUMENT_LOCALES,
  dataOf,
} from "../document-sql.ts";
import { loadDoc } from "../documents/load-document.query.ts";
import { loadSharedState } from "./load-shared-state.query.ts";
import { loadGlobal } from "../globals/load-global.query.ts";

type LocaleRow = {
  locale: string;
  data: string;
  updated_at: number;
  published_at: number | null;
  has_draft: number;
};

/**
 * A document or global as a write sees it: the shared fields of the perspective merged with the requested locale's
 * row, without fallback. A missing row reads as `null` values, `publishedAt` null and no draft. The published
 * perspective needs the shared row to be published, not the locale row. `updatedAt` is the later of the shared row
 * and the locale row, like a localized read.
 * For a document, `id` is its id; a global ignores it. `locales` lists the rows of the perspective.
 * @returns The document with `locale`, `locales` and `sharedDraft`, or `undefined` when the shared row is not seen.
 */
export async function loadLocaleDoc(
  db: Db,
  target: { kind: "collection" | "global"; name: string },
  id: string,
  drafts: boolean,
  loc: Loc,
): Promise<DocData | undefined> {
  const global = target.kind === "global";
  const shared = global
    ? await loadGlobal(db, target.name, drafts)
    : await loadDoc(db, target.name, id, drafts);
  if (!shared) return undefined;

  const owner = global ? GLOBAL_LOCALES : DOCUMENT_LOCALES;
  const { rows } = await sql<LocaleRow>`
    SELECT locale, ${sql.raw(dataOf(drafts))} AS data, updated_at, published_at, draft IS NOT NULL AS has_draft
    FROM ${sql.table(owner.table)} WHERE ${sql.id(owner.key)} = ${global ? target.name : id}`.execute(
    db,
  );
  const own = rows.find((r) => r.locale === loc.locale);
  const state = await loadSharedState(db, target, global ? target.name : id);

  return {
    ...mergeLocale(loc.keys, shared, own && JSON.parse(own.data), null),
    updatedAt: new Date(Math.max(Date.parse(shared.updatedAt), own?.updated_at ?? 0)).toISOString(),
    publishedAt: own?.published_at == null ? null : new Date(own.published_at).toISOString(),
    hasDraft: Boolean(own?.has_draft),
    locale: loc.locale,
    sharedDraft: state?.differs ?? false,
    locales: loc.locales.filter((l) =>
      rows.some((r) => r.locale === l && (drafts || r.published_at !== null)),
    ),
  };
}
