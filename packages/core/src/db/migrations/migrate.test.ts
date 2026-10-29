import { sql } from "kysely";
import { expect, it } from "vitest";
import { onPglite, testDatabase } from "../../tests/setup.ts";
import { createDb } from "../create-db.ts";
import { libsql } from "../../integrations/libsql/index.ts";
import { migrate } from "./migrate.ts";
import { migrator } from "./cms.ts";

it("runs CMS migrations once", async () => {
  const db = createDb(testDatabase());
  const auth = { database: { db, type: onPglite ? ("postgres" as const) : ("sqlite" as const) } };
  await migrate(db, auth);
  await migrate(db, auth);
  const { rows } = await (
    onPglite
      ? sql<{
          name: string;
        }>`SELECT tablename AS name FROM pg_tables WHERE schemaname = current_schema()
        UNION SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()`
      : sql<{ name: string }>`SELECT name FROM sqlite_master`
  ).execute(db);
  expect(rows.map((r) => r.name)).toEqual(
    expect.arrayContaining([
      "cms_documents",
      "cms_globals",
      "cms_documents_collection_idx",
      "cms_kysely_migration",
      "cms_uploads",
      "cms_media_key_idx",
      "cms_document_locales",
      "cms_global_locales",
      "cms_schema_state",
      "cms_document_locales_locale_idx",
      "cms_invites",
      "cms_invites_email_idx",
      "cms_invites_token_idx",
    ]),
  );
});

// The SQLite migrations ran on databases before Postgres had any, so only they upgrade old rows.
it.skipIf(onPglite)("backfills published_at with updated_at", async () => {
  const db = createDb(libsql(":memory:"));
  const { error } = await migrator(db).migrateTo("003_cms_media_key");
  if (error) throw error;
  await sql`INSERT INTO cms_documents (id, collection, data, created_at, updated_at)
    VALUES ('a', 'posts', '{}', 1, 2)`.execute(db);
  await sql`INSERT INTO cms_globals (name, data, created_at, updated_at)
    VALUES ('site', '{}', 3, 4)`.execute(db);
  await migrate(db, { database: { db, type: "sqlite" } });
  const docs = await sql<{
    published_at: number;
    draft: string | null;
  }>`SELECT published_at, draft FROM cms_documents`.execute(db);
  expect(docs.rows).toEqual([{ published_at: 2, draft: null }]);
  const globals = await sql`SELECT published_at, draft FROM cms_globals`.execute(db);
  expect(globals.rows).toEqual([{ published_at: 4, draft: null }]);
});

it.skipIf(onPglite)("adds the authors of a document, empty for existing rows", async () => {
  const db = createDb(libsql(":memory:"));
  const { error } = await migrator(db).migrateTo("006_cms_invites");
  if (error) throw error;
  await sql`INSERT INTO cms_documents (id, collection, data, created_at, updated_at)
    VALUES ('a', 'posts', '{}', 1, 2)`.execute(db);
  await migrate(db, { database: { db, type: "sqlite" } });
  const docs = await sql`SELECT created_by, updated_by FROM cms_documents`.execute(db);
  expect(docs.rows).toEqual([{ created_by: null, updated_by: null }]);
});
