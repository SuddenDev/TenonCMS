# content

The engine shared by collections, globals and media. It receives a CMS core and call scope; it does not expose another public API. It depends on schema processing and database queries, and uses media decoration for reads.

| Path                         | Responsibility                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `targets.ts`                 | Collection/global names, schema lookup, name checks and draft eligibility.                  |
| `lifecycle/run-operation.ts` | Operation hooks, write transactions and outermost error hooks after rollback.               |
| `lifecycle/collect-hooks.ts` | Feature, plugin and root hook ordering; media uses its own hooks.                           |
| `lifecycle/hook-args.ts`     | Hook arguments from a transaction-bound scope.                                              |
| `reads/`                     | Load documents/globals, validate read options and run read processing.                      |
| `writes/`                    | Shared validation/persistence pipeline, publishing, discard and deletion.                   |
| `population/`                | Population specifications, batched relation/join reads, selection and selection validation. |
| `integrity/`                 | Reference checks, uniqueness checks and restrict/set-null/cascade effects.                  |

A collection create enters `collections/operations/create.operation.ts`, then `lifecycle/run-operation.ts`, then `writes/write-document.ts`:

```text
beforeOperation -> transaction -> defaults -> slugs -> beforeValidate -> parse
-> validate -> beforeChange -> parse again -> unique -> references -> save
-> afterChange -> afterRead -> afterOperation -> commit
```

Draft saves check types and run change preprocessing, then save the pending version. They skip custom validation, uniqueness, reference checks and `afterChange`. Publishing runs the complete write pipeline over pending data.

`reads/read-results.ts` runs `beforeRead`, population, field and feature `afterRead`, media decoration, then selection. Population batches target reads per field and hop and runs the target collection's read hooks in the original scope.

`writes/remove-document.ts` removes the row and applies reference effects in the same transaction. Effects use the original scope, and cascades end when they return to a row already deleted. `cms/runtime/` supplies context and transaction helpers; hooks receive its bound API for nested calls.
