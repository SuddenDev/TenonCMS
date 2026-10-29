# DB

Content persistence through Kysely. `database` is always `{ dialect }`: libsql (SQLite or Turso), `node:sqlite`, Durable Object storage, Postgres (`pg`) or PGlite, each built by a helper in `src/integrations/`, or a host's own dialect. The module owns the connection, the fixed tables, their migrations and the content queries. It does not validate data or run hooks; that is [content](../content/README.md). Media operations still own the `cms_uploads` queries.

## Follow a read

`loadDoc()` flows through:

`queries/documents/load-document.query.ts` → `queries/document-sql.ts` → `map-document.ts`

The query file names one statement. `document-sql.ts` gives it the perspective: `selectDocs()` picks the visible rows (`visible()`) and the `Row` columns (`rowColumns()`), with the data from `dataOf()`. `toDoc()` parses the JSON and adds `id`, `createdAt`, `updatedAt`, `publishedAt` and `hasDraft`.

A localized collection or global reads with a `Loc` (`document-sql.ts`): the requested and the default locale row join as `lr` and `ld`, `visible()` and `jsonAt()` follow the fallback, and `toDoc()` merges the rows with `mergeLocale()` and adds `locale`, `locales` and `sharedDraft`. `publishedAt` and `hasDraft` come from the requested row, or with fallback from the default row when the requested one is missing. The published perspective joins published locale rows only. Unlocalized reads pass no `Loc` and run no joins.

A joined query reads two tables with the same column names, so conditions and `ORDER BY` on `cms_documents` MUST be qualified (`cms_documents.created_at`, `cms_documents.id`). `jsonAt(path, drafts, loc)` reads a localized key as `COALESCE(requested, default)` with fallback, so a filter matches the value a read returns.

`holdsAt(source, path, many, id)` asks whether a relation at a `Step[]` path in a JSON column holds `id`. Each array or blocks step adds one nested `json_each` over the items, filtered by `blockType` for a block; a `many` relation adds one more. JSON paths, block names and the id are parameters. `referencingDocs()`, `referencingGlobal()` and `referencingLocales()` (on `l.data` and `l.draft`) use it.

## Files

| Path                           | Responsibility                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `index.ts`                     | Entry barrel for connection, types, mapping, dialect and migration helpers.                         |
| `types.ts`                     | Document, global and upload table contracts and the perspective row shape.                          |
| `create-db.ts`                 | Open Kysely on the configured dialect.                                                              |
| `adapters/libsql.ts`           | Kysely driver over libsql: one client per driver, interactive transactions.                         |
| `adapters/durable-object.ts`   | Kysely driver over Durable Object storage: transactions through `storage.transaction()`.            |
| `adapters/node-sqlite.ts`      | Kysely's `SqliteDialect` over `node:sqlite`: one database per driver, opened on the first query.    |
| `adapters/pglite.ts`           | Kysely driver over PGlite: one caller at a time, transactions with `BEGIN` / `COMMIT`.              |
| `map-document.ts`              | Decode JSON, merge locale rows and attach document/global metadata.                                 |
| `migrations/cms.ts`            | SQLite migration keys/bodies and the Kysely migrator. Shipped migrations MUST NOT change.           |
| `migrations/postgres.ts`       | The Postgres migrations. A new migration gets a key here and in `cms.ts`.                           |
| `migrations/migrate.ts`        | Run CMS migrations, then better-auth migrations. On Postgres in one locked transaction.             |
| `migrations/sync-localized.ts` | `syncLocalized()`: moves values between shared data and locale rows when the localized keys change. |
| `queries/document-sql.ts`      | Shared perspective, JSON, row-column and ID expressions, and `holdsAt()` for reference scans.       |
| `queries/documents/`           | Find, load, batched ID reads, insert, update and delete.                                            |
| `queries/globals/`             | Load and publish globals.                                                                           |
| `queries/drafts/`              | Insert/save/discard pending document and global versions.                                           |
| `queries/locales/`             | Upsert, discard, delete and load the locale rows of a document or global.                           |
| `queries/references/`          | Existing IDs, uniqueness, reverse references (also in locale rows) and populated joins.             |
| `queries/media/`               | Indexed media-key lookup and distinct library values.                                               |
| `queries/versions/`            | Record (draft saves merge), list, read and delete versions.                                         |

`cms_documents` holds one JSON row per document; `cms_globals` holds one per global. Both have pending `draft` data and `published_at` (`NULL` before first publication). Published reads see published rows and `data`. Draft reads see every row and `COALESCE(draft, data)`.

`existingIds()` counts published and unpublished rows. Uniqueness and deletion reference scans use published `data`. `cms_uploads` reserves unfinished upload keys and binds uploads to their users; media upload/library operations query it.

`cms_media_key_idx` is a partial unique index on `json_extract(data, '$.key')` for `collection = 'media'`. Its lookup repeats that expression and filter as literal SQL so SQLite uses the index. Values remain parameters. Field names MUST be checked against the schema before they reach content filter queries.

## Locale tables

Migration `005_cms_locales` adds three tables:

| Table                  | Columns                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `cms_document_locales` | `document_id`, `locale`, `data`, `draft`, `created_at`, `updated_at`, `published_at`. Primary key `(document_id, locale)`.    |
| `cms_global_locales`   | The same with `name` instead of `document_id`. Primary key `(name, locale)`.                                                  |
| `cms_schema_state`     | `kind`, `name`, `localized`: the localized top-level keys last synced, as a JSON array or `NULL`. Primary key `(kind, name)`. |

A localized collection or global keeps shared fields in `cms_documents` / `cms_globals` and localized fields in the locale row's `data` and `draft`. A locale row is published when its `published_at` is set; the document row's `published_at` tracks the shared fields. Unlocalized entries have no locale rows. A document delete removes its locale rows in the same transaction. A locale removed from the config keeps its rows, and reads ignore them.

`syncLocalized()` runs once per connection, after the migrations (`cms/runtime/create-runtime.ts`). It compares the localized keys per entry with `cms_schema_state` and, in one transaction, moves the changed keys for `data` and `draft`: shared to the default locale's row (a missing row is created with the document's `published_at`), or back to the shared data. Other locales keep their rows. The first run with an empty state only records. The row `kind = 'meta'`, `name = 'defaultLocale'` stores the default locale; a change moves nothing and logs a warning with the number of documents that have no row in the new one. Moves are logged with consola, for example `moved posts.title to locale rows (12 documents)`.

## Postgres

`isPostgres(db)` (`document-sql.ts`) is true when the Kysely adapter is `PostgresAdapter`: `postgres()` and `pglite()` from `integral-cms/postgres` and `integral-cms/pglite`. It holds for a transaction too. better-auth gets `type: "postgres"` from it.

- JSON stays `text`. A path read casts: `(data)::jsonb #>> '{a,b}'` returns text, so `equals()` compares text and parameters arrive as text (`5`, `true`).
- The helpers that differ take `db` first: `jsonAt()`, `equals()`, `holdsAt()` (`jsonb_array_elements`), `inIds()` (`= ANY(array)`), `eachItem()`, `containsText()` (`strpos`), `jsonArrayOf()` (`json_agg`), and `mediaKeyQuery()`, whose literal MUST match the Postgres index `(data::jsonb ->> 'key')`.
- A scalar where an array is expected yields no items (`arrayOrNull()`), as in SQLite it yields no match.
- Times are milliseconds in `bigint`. Both drivers parse `bigint` as a number; `pg` would return a string.
- `cms_documents` and `cms_versions` have a `rowid` identity column, so `ORDER BY … rowid` works in both.
- better-auth's columns are camelCase. Raw SQL MUST quote them (`k."createdAt"`), or Postgres folds them to lowercase. Its booleans are `boolean`: compare with `true` / `false`, and read them as a number or a boolean.
- `migrate()` runs both migration sets in one transaction that holds `pg_advisory_xact_lock`. A transaction lock, not a session lock: behind PgBouncer in transaction mode (Neon's pooled URL), a session lock can stay on another server connection. `migrate.live.test.ts` checks four instances on one fresh database; it needs `POSTGRES_TEST_URL`.
- PGlite has one connection. Like `:memory:` libsql, a query outside `trx` during a transaction waits forever.

## Invite and user queries

Migration `006_cms_invites` adds `cms_invites`: `id`, `email` (lowercase, unique), `role`, `token_hash` (SHA-256 hex, unique), `invited_by`, `expires_at`, `created_at`. `queries/invites/` inserts, finds by token or email, lists, renews (`RETURNING`), claims (`DELETE … RETURNING`, so a token claims once) and deletes. Queries that check expiry take `now`.

`queries/users/` reads better-auth's `user` table by name with plain SQL: `userExists()` by email, and `otherAdmins()`, the active admins other than one user, for the last-admin guard.
