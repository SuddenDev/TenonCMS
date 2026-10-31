import type { Core } from "../../cms/runtime/types.ts";
import type { Db } from "../../db/queries/document-sql.ts";
import type { Fields } from "../../schema/fields/index.ts";
import type { LinkedReference } from "../../errors.ts";
import { hasLinkingFields } from "../runtime/fields.ts";

/** One stored published or draft value and its transaction-bound writer. */
export type LinkOwner = {
  owner: Omit<LinkedReference, "field">;
  fields: Fields;
  data: Record<string, any>;
  save(data: Record<string, any>): Promise<unknown>;
};

/** Scans only collections and globals whose schemas contain linking fields. Call inside the deletion transaction. */
export async function linkOwners(db: Db, core: Core) {
  // shortcut: scans link owners in memory; index references when deletion scans become slow.
  const rows: LinkOwner[] = [];

  for (const [collection, entry] of Object.entries(core.schema.collections)) {
    if (!hasLinkingFields(entry.fields)) continue;

    for (const row of await db
      .selectFrom("cms_documents")
      .select(["id", "data", "draft"])
      .where("collection", "=", collection)
      .execute()) {
      for (const column of ["data", "draft"] as const)
        if (row[column])
          rows.push({
            owner: { collection, id: row.id, draft: column === "draft" },
            fields: entry.fields,
            data: JSON.parse(row[column]!),
            save: (data) =>
              db
                .updateTable("cms_documents")
                .set({ [column]: JSON.stringify(data) })
                .where("id", "=", row.id)
                .execute(),
          });
    }

    if (entry.localized) {
      const locals = await db
        .selectFrom("cms_document_locales")
        .innerJoin("cms_documents", "cms_documents.id", "cms_document_locales.document_id")
        .selectAll("cms_document_locales")
        .where("cms_documents.collection", "=", collection)
        .execute();

      for (const local of locals)
        for (const column of ["data", "draft"] as const)
          if (local[column])
            rows.push({
              owner: {
                collection,
                id: local.document_id,
                locale: local.locale,
                draft: column === "draft",
              },
              fields: entry.fields,
              data: JSON.parse(local[column]!),
              save: (data) =>
                db
                  .updateTable("cms_document_locales")
                  .set({ [column]: JSON.stringify(data) })
                  .where("document_id", "=", local.document_id)
                  .where("locale", "=", local.locale)
                  .execute(),
            });
    }
  }

  for (const [global, entry] of Object.entries(core.schema.globals)) {
    if (!hasLinkingFields(entry.fields)) continue;

    const row = await db
      .selectFrom("cms_globals")
      .selectAll()
      .where("name", "=", global)
      .executeTakeFirst();
    if (row)
      for (const column of ["data", "draft"] as const)
        if (row[column])
          rows.push({
            owner: { global, draft: column === "draft" },
            fields: entry.fields,
            data: JSON.parse(row[column]!),
            save: (data) =>
              db
                .updateTable("cms_globals")
                .set({ [column]: JSON.stringify(data) })
                .where("name", "=", global)
                .execute(),
          });

    if (entry.localized)
      for (const local of await db
        .selectFrom("cms_global_locales")
        .selectAll()
        .where("name", "=", global)
        .execute()) {
        for (const column of ["data", "draft"] as const)
          if (local[column])
            rows.push({
              owner: { global, locale: local.locale, draft: column === "draft" },
              fields: entry.fields,
              data: JSON.parse(local[column]!),
              save: (data) =>
                db
                  .updateTable("cms_global_locales")
                  .set({ [column]: JSON.stringify(data) })
                  .where("name", "=", global)
                  .where("locale", "=", local.locale)
                  .execute(),
            });
      }
  }

  return rows;
}
