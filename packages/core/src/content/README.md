# Content

The engine that collections, globals and media share. It runs the lifecycle, validation, hooks, population and integrity checks for every read and write. It gets a CMS core and a call scope and exposes no public API of its own. Feature modules such as [collections](../collections/README.md) and [globals](../globals/README.md) call into it.

## Follow a create

`cms.create("posts", data)` enters through `collections/operations/create.operation.ts`, then flows through:

`lifecycle/run-operation.ts` → `writes/write-document.ts` → `writes/prepare-data.ts` → `writes/persist-document.ts`

`runOperation()` runs operation hooks and delegates transaction ownership to `cms/runtime/transaction.ts`. `writeDocument()` owns the save, draft, publish or deletion-effect mode and selects its source. `prepareData()` merges the input over it and validates it, and `persistDocument()` checks integrity, saves and runs the after hooks:

```text
transaction -> beforeOperation -> defaults -> slugs -> beforeValidate -> parse
-> validate -> beforeChange -> parse again -> unique -> references -> save
-> afterChange -> afterRead -> afterOperation -> commit
```

Draft saves check types and run the before hooks, then save the pending version. They skip custom validation, uniqueness, reference checks and `afterChange`. Publishing runs the full pipeline over the pending data.

`writeDocument()` builds one internal `WriteState` for preparation and persistence. Callers provide the target, operation, input, optional ID and mode. They do not supply derived fields, hook arguments, loose parsing or locale-row existence. `prepare-data.ts` keeps validation looseness separate from storage mode; `persist-localized.ts` owns shared drafts and empty translations.

## Follow a read

`cms.find("posts", { populate: { author: true } })` flows through:

`reads/read-documents.ts` → `reads/read-results.ts` → `population/populate.ts` → `population/select-fields.ts`

[access/read.ts](../access/read.ts) owns admission and field-query eligibility before loading. `readDocs()` runs `beforeRead`, population, field and collection `afterRead`, media URLs, `alternates` (`reads/alternates.ts`: one batched published read per locale, then `permalinkUrl()`), then `select`. Population replaces relation ids with documents. It loads all targets of one field in one query, and each loaded batch runs its own collection's read hooks in the scope of the outer read. Groups, arrays and blocks pass the plan through and count no hop; the items of every document populate together, an array's with its `fields`, a blocks field's once per block name with that block's sub-plan.

## Files

| Path                                                  | Responsibility                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `targets.ts`                                          | Collection and global names, schema lookup, name checks and draft eligibility.                                                       |
| `locale.ts`                                           | `withLocale()`: applies `locale` and `fallback` to a scope and rejects unknown locales.                                              |
| `lifecycle/run-operation.ts`                          | Operation hooks, delegation to the transaction owner and `afterError` after rollback.                                                |
| `lifecycle/collect-hooks.ts`                          | Hook order: collection or global, then plugins, then root. None for media.                                                           |
| `lifecycle/hook-args.ts`                              | The arguments every hook gets.                                                                                                       |
| `lifecycle/run-read-hooks.ts`                         | `beforeRead` and `afterRead`, shared by reads, writes and population.                                                                |
| `reads/`                                              | Load documents and globals, check read options and run read processing.                                                              |
| `reads/loc-of.ts`                                     | `locOf()`: the locale descriptor (`Loc`) of a read, or `undefined` when not localized.                                               |
| `reads/merge-locale.ts`                               | `mergeLocale()`: shared fields plus the locale row, then the default row, then `null`.                                               |
| `reads/alternates.ts`                                 | `addAlternates()`: the `alternates` metadata, one batched published read per locale.                                                 |
| `collections/operations/local/alternates-at.local.ts` | `alternatesAt(url)`: matches a URL against the `permalink` templates (top-level fields only), reads that document with `alternates`. |
| `writes/`                                             | The write pipeline, publish, discard and delete. `prepare-data.ts` prepares; `persist-document.ts` saves.                            |
| `writes/split-locale.ts`                              | `splitLocale()`: written data to shared and localized keys.                                                                          |
| `writes/persist-localized.ts`                         | `persistLocalized()`: saves a localized write to the document row and the locale row.                                                |
| `writes/discard-locale.ts`                            | `discardLocalized()`: drops one locale's draft, or every draft with `all`.                                                           |
| `writes/copy-locale.ts`                               | `copyLocalized()`: fills a locale from another through the write pipeline.                                                           |
| `writes/remove-locale.ts`                             | `removeLocalized()`: deletes one locale row and runs `afterChange`.                                                                  |
| `population/populate-plan.ts`                         | What a populate option resolves at each key and hop. Groups and lists are always on.                                                 |
| `population/populate.ts`                              | Batched relation and join reads, with the target's read hooks.                                                                       |
| `population/select-fields.ts`                         | Projection to the `select` keys. Items keep `id` and `blockType`; blocks by block name.                                              |
| `population/validate-select.ts`                       | Checks that `select` fits the fields and what `populate` resolves.                                                                   |
| `integrity/check-*.ts`                                | Existing ids, file rules and unique values before a save, at positional paths.                                                       |
| `integrity/find-references.ts`                        | Every document and global that points to a document.                                                                                 |
| `integrity/apply-on-delete.ts`                        | `restrict`, then `set-null`, then `cascade` after a delete.                                                                          |

`checkRefs()` walks the data with `eachField()`, so it reaches references at any depth and fails at the positional path (`links.1.page`). `references()` runs one query per `Step[]` path (`schema/traversal/relation-paths.ts`). An owner with a block inside itself (`nestsItself()`) has no complete list of paths: one text search finds its rows that contain the id, and a walk over each row gives positional paths. `clear()` in `apply-on-delete.ts` reaches every item that holds the value through `holdersAt()`, and `set-null` clears it in each item and keeps the items.

`writes/remove-document.ts` deletes the row first and applies `onDelete` effects in the same transaction. Effects use the original scope, so a cascade that comes back to a deleted row finds nothing and cycles end. Hooks MUST make nested calls through the `cms` they get, so the calls join the transaction.

`writes/persist-document.ts` records a version after each save (`db/queries/versions/record-version.query.ts`). Draft saves of one user merge into one version until a 30-minute break. `writes/remove-document.ts` deletes the versions with the document. See [versions](../versions/README.md).

`writes/write-document.ts` compares the caller's `updatedAt` with the loaded source, after access and before any hook. A mismatch throws `ConflictError`. Publish passes the token through `writes/publish-document.ts`.

## Locales

`withLocale()` (`locale.ts`) puts `locale` and `fallback` on the scope. An option wins over the scope's value, which a nested call inherits, and the defaults are `localization.defaultLocale` and `localization.fallback`. An unknown locale, or any locale without `localization`, throws a `ValidationError`. Hooks get `locale` from the scope. Unlocalized collections and globals ignore it.

A localized read passes the `Loc` of `locOf()` to the queries, which join the requested and the default locale row. `mergeLocale()` builds the document: shared keys from the document row, each localized key from the requested row, then the default row when `fallback` is on, then `null`. A stored `null` falls back too. Population reads each target with its own `Loc` in the same locale. `addAlternates()` runs after the read hooks, only for collections with a `permalink`, and reads the published perspective without fallback in every locale.

A localized write loads the merged document of the scope's locale (shared fields plus that locale's row, no fallback, `db/queries/locales/load-locale-doc.query.ts`) and runs the whole pipeline on it. `writes/persist-localized.ts` then splits the data with `splitLocale()`: shared keys go to the document row, localized keys to the locale row. A draft save writes both `draft` columns, but leaves the shared draft alone when the shared values do not change. A publish writes both `data` columns and clears both drafts. A published write never creates a row for a locale without values.

`writes/discard-locale.ts` drops one locale's draft and keeps the shared draft; with `all`, every draft goes. Locale rows that were never published are deleted, and so is a never-published document without rows. `copy-locale.ts` reads the source locale in the drafts perspective without fallback and writes it to the scope's locale (a draft, or straight to the data with `drafts: false`). `remove-locale.ts` refuses the default locale and the last row.

Integrity covers locale rows. `checkUnique()` compares a localized key with the values a read of that locale returns, fallback included. `findReferences()` also scans the data and the draft of every locale row for localized relation, image and file keys. `applyOnDelete()` writes `set-null` back to the row that holds the ID, in its locale, and a pending locale draft is rewritten without hooks. Deleting a document deletes its locale rows in the same transaction.
