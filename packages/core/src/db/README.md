# DB

Content persistence through Kysely and libsql (SQLite or Turso). The module owns the connection, the fixed tables, their migrations and the content queries. It does not validate data or run hooks; that is [content](../content/README.md). Media operations still own the `cms_uploads` queries.

## Follow a read

`loadDoc()` flows through:

`queries/documents/load-document.query.ts` → `queries/document-sql.ts` → `map-document.ts`

The query file names one statement. `document-sql.ts` gives it the perspective: `selectDocs()` picks the visible rows (`visible()`) and the `Row` columns (`rowColumns()`), with the data from `dataOf()`. `toDoc()` parses the JSON and adds `id`, `createdAt`, `updatedAt`, `publishedAt` and `hasDraft`.

## Files

| Path                      | Responsibility                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `index.ts`                | Entry barrel for connection, types, mapping, dialect and migration helpers.        |
| `types.ts`                | Document, global and upload table contracts and the perspective row shape.         |
| `create-db.ts`            | Connect Kysely to the libsql dialect.                                              |
| `adapters/libsql.ts`      | Kysely driver and interactive transaction behavior.                                |
| `map-document.ts`         | Decode JSON and attach document/global metadata.                                   |
| `migrations/cms.ts`       | CMS migration keys/bodies and Kysely migrator. Shipped migrations MUST NOT change. |
| `migrations/migrate.ts`   | Run CMS migrations, then better-auth migrations.                                   |
| `queries/document-sql.ts` | Shared perspective, JSON, row-column and ID expressions.                           |
| `queries/documents/`      | Find, load, batched ID reads, insert, update and delete.                           |
| `queries/globals/`        | Load and publish globals.                                                          |
| `queries/drafts/`         | Insert/save/discard pending document and global versions.                          |
| `queries/references/`     | Existing IDs, uniqueness, reverse references and populated joins.                  |
| `queries/media/`          | Indexed media-key lookup and distinct library values.                              |

`cms_documents` holds one JSON row per document; `cms_globals` holds one per global. Both have pending `draft` data and `published_at` (`NULL` before first publication). Published reads see published rows and `data`. Draft reads see every row and `COALESCE(draft, data)`.

`existingIds()` counts published and unpublished rows. Uniqueness and deletion reference scans use published `data`. `cms_uploads` reserves unfinished upload keys and binds uploads to their users; media upload/library operations query it.

`cms_media_key_idx` is a partial unique index on `json_extract(data, '$.key')` for `collection = 'media'`. Its lookup repeats that expression and filter as literal SQL so SQLite uses the index. Values remain parameters. Field names MUST be checked against the schema before they reach content filter queries.
