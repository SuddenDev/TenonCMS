# db

The database layer: libsql (SQLite or Turso) through Kysely. All SQL lives here.

| File           | What it does                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| `index.ts`     | `createDb()`, the table types, a small libsql dialect for Kysely, and `migrate()` (core tables, then better-auth's). |
| `documents.ts` | Every query on the two tables: find, load, insert, update, delete, globals, and the scans for references and joins.  |

Two tables hold all content:

- `cms_documents`: one row per document, the fields as JSON in `data`. Filters use `json_extract`.
- `cms_globals`: one row per global.

`cms_uploads` holds media uploads in progress; `media/upload.ts` owns its queries.

`cms_media_key_idx` is a partial unique index on `json_extract(data, '$.key')` for `collection = 'media'`. SQLite uses an
expression index only when the query has the same expression and filter as literals, not as bound parameters, so
`mediaByKey()` has its own literal SQL instead of going through `findDocs()`.

A schema change needs no migration. Field names MUST be checked against the schema before they reach a query.
