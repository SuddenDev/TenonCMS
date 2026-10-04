# cms

Instance construction and local API assembly. `index.ts` exports `defineCms()` and public types. Feature actions live in `collections/` and `globals/`; their shared pipelines live in `content/`.

| Path                           | Responsibility                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `create-cms.ts`                | Assemble schema and defaults, connect lazily, build the core and expose `drafts()`/`forRequest()`. |
| `config/options.ts`            | CMS options and plugin/settings type inference.                                                    |
| `config/add-settings.ts`       | Add default or replacement settings globals with duplicate-name checks.                            |
| `api/bind-api.ts`              | Bind local methods and optional media API to one scope.                                            |
| `api/types.ts`                 | Public typed local API and method documentation.                                                   |
| `runtime/types.ts`             | `Core`, `Scope` and the bound `Inner` scope used by hooks.                                         |
| `runtime/operation-context.ts` | Keep nested call context and bind the API hooks receive.                                           |
| `runtime/transaction.ts`       | Reuse a scope's transaction or open one for media operations.                                      |

The API routes collection writes through their operations and `content/lifecycle/run-operation.ts`. `content/writes/write-document.ts` owns the shared write stage order and draft behavior. `content/reads/read-results.ts` owns read hooks, population, media decoration and selection. Database queries live in `db/`; auth configuration lives in `auth/`.

Nested calls inherit transaction, user, context and perspective. Reads use the published perspective unless `Scope.drafts` is set. `cms.drafts()` enables drafts; `cms.forRequest(request)` enables them only with the preview cookie and a valid session. Read options do not set the perspective.
