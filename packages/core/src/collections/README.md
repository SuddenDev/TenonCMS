# collections

Collection configuration and document actions. `index.ts` exports configuration types and definition helpers; operations use the shared `content/` engine and CMS runtime scope.

| Path                             | Responsibility                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| `config/types.ts`                | Collection options, fields, hooks and admin metadata.                                  |
| `config/define-collection.ts`    | `defineCollection()` with literal field and hook inference.                            |
| `operations/create.operation.ts` | Run collection create hooks and the shared write pipeline.                             |
| `operations/update.operation.ts` | Run collection update hooks and the shared write pipeline, including deletion effects. |
