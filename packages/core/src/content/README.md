# Content

The engine that collections, globals and media share. It runs the lifecycle, validation, hooks, population and integrity checks for every read and write. It gets a CMS core and a call scope and exposes no public API of its own. Feature modules such as [collections](../collections/README.md) and [globals](../globals/README.md) call into it.

## Follow a create

`cms.create("posts", data)` enters through `collections/operations/create.operation.ts`, then flows through:

`lifecycle/run-operation.ts` → `writes/write-document.ts` → `writes/helpers/prepare-data.ts` → `writes/helpers/store.ts`

`run()` opens the transaction and runs the operation hooks. `write()` loads the current data, `prepareData()` merges the input over it and validates it, and `storeDocument()` checks integrity, saves and runs the after hooks:

```text
transaction -> beforeOperation -> defaults -> slugs -> beforeValidate -> parse
-> validate -> beforeChange -> parse again -> unique -> references -> save
-> afterChange -> afterRead -> afterOperation -> commit
```

Draft saves check types and run the before hooks, then save the pending version. They skip custom validation, uniqueness, reference checks and `afterChange`. Publishing runs the full pipeline over the pending data.

## Follow a read

`cms.find("posts", { populate: { author: true } })` flows through:

`reads/read-documents.ts` → `reads/read-results.ts` → `population/populate.ts` → `population/select-fields.ts`

`readDocs()` runs `beforeRead`, population, field and collection `afterRead`, media URLs, then `select`. Population replaces relation ids with documents. It loads all targets of one field in one query, and each loaded batch runs its own collection's read hooks in the scope of the outer read.

## Files

| Path                            | Responsibility                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `targets.ts`                    | Collection and global names, schema lookup, name checks and draft eligibility.  |
| `lifecycle/run-operation.ts`    | Operation hooks, write transactions and `afterError` after the rollback.        |
| `lifecycle/collect-hooks.ts`    | Hook order: collection or global, then plugins, then root. None for media.      |
| `lifecycle/hook-args.ts`        | The arguments every hook gets.                                                  |
| `lifecycle/run-read-hooks.ts`   | `beforeRead` and `afterRead`, shared by reads, writes and population.           |
| `reads/`                        | Load documents and globals, check read options and run read processing.         |
| `writes/`                       | The write pipeline, publish, discard and delete. `helpers/` prepares and saves. |
| `population/populate-plan.ts`   | What a populate option resolves at each key and hop.                            |
| `population/populate.ts`        | Batched relation and join reads, with the target's read hooks.                  |
| `population/select-fields.ts`   | Projection of a read result to the `select` keys.                               |
| `population/validate-select.ts` | Checks that `select` fits the fields and what `populate` resolves.              |
| `integrity/check-*.ts`          | Existing ids, file rules and unique values before a save.                       |
| `integrity/find-references.ts`  | Every document and global that points to a document.                            |
| `integrity/apply-on-delete.ts`  | `restrict`, then `set-null`, then `cascade` after a delete.                     |

`writes/remove-document.ts` deletes the row first and applies `onDelete` effects in the same transaction. Effects use the original scope, so a cascade that comes back to a deleted row finds nothing and cycles end. Hooks MUST make nested calls through the `cms` they get, so the calls join the transaction.
