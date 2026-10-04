# globals

Global configuration and named singleton writes. `index.ts` exports configuration types and definition helpers; operations use the shared `content/` engine and CMS runtime scope.

| Path                          | Responsibility                                                          |
| ----------------------------- | ----------------------------------------------------------------------- |
| `config/types.ts`             | Global options, fields, hooks and admin metadata.                       |
| `config/define-global.ts`     | `defineGlobal()` with literal field and hook inference.                 |
| `operations/set.operation.ts` | Run the shared write pipeline for a global, including deletion effects. |

Globals keep their existing lifecycle: they do not run collection `beforeOperation` and `afterOperation` hooks.
