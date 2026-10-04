# db

The database layer: libsql (SQLite or Turso) through Kysely. All SQL lives here.

| File           | What it does                                                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`     | `createDb()`, the table types, `toDoc()` (a row with its meta), a small libsql dialect for Kysely, and `migrate()` (core tables, then better-auth's).                                                             |
| `documents.ts` | Every query on the two tables: find, load, insert, update, delete, drafts (`insertDraft`, `saveDraft`, `discardDraft`, `saveGlobalDraft`, `discardGlobalDraft`), globals, and the scans for references and joins. |

Two tables hold all content:

- `cms_documents`: one row per document, the fields as JSON in `data`. Filters use `json_extract`.
- `cms_globals`: one row per global.

Both have `draft` (the pending version, or `NULL`) and `published_at` (`NULL` if never published). Every write today
publishes: it sets `published_at`, and media rows are always published. Reads run in a perspective, a `drafts` flag:

- published (default): `WHERE published_at IS NOT NULL`, data from `data`.
- drafts: every row, data from `COALESCE(draft, data)`.

`findDocs()`, `loadDoc()`, `byIds()`, `joinedDocs()` and `loadGlobal()` take it. `existingIds()` (ref checks) counts
every row, `taken()` (unique) and the reverse scans for `onDelete` read published `data`.

`cms_uploads` holds media uploads in progress; `media/upload.ts` and `media/library.ts` (`namesIn()`) own its queries.

`cms_media_key_idx` is a partial unique index on `json_extract(data, '$.key')` for `collection = 'media'`. SQLite uses an
expression index only when the query has the same expression and filter as literals, not as bound parameters, so
`mediaByKey()` has its own literal SQL instead of going through `findDocs()`.

A schema change needs no migration. Field names MUST be checked against the schema before they reach a query.
