# Globals

Globals are named singleton documents for site-wide data. This module defines their config and binds get, set, publish and discard operations to a CMS scope. Shared validation, hooks and persistence live in [content](../content/README.md).

## Follow a read

`GET /_tenon/globals/general` flows through:

`endpoints/get.endpoint.ts` → `operations/local/get.local.ts` → `operations/get.operation.ts` → `content/reads/read-global.ts`

The local method checks the global name. The operation enters the shared lifecycle, and the reader loads the global for the current published or drafts perspective. A global that has never been saved returns no field values.

## Files

| Path                | Responsibility                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `config/`           | Global options and `defineGlobal()`, which preserves field and hook types.                        |
| `operations/local/` | Bind API methods to a scope and check global names and draft eligibility.                         |
| `operations/`       | Run get, set, publish, unpublish and discard through the shared content engine.                   |
| `endpoints/`        | Parse HTTP requests and call local methods. `routes.ts` groups public reads and protected writes. |

Global operations run global and root hooks; they skip collection `beforeOperation` and `afterOperation` hooks. Drafts are enabled by default; set `drafts: false` to disable them. `schedule: true` lets editors schedule a publish or unpublish; it needs drafts, and [schedule](../schedule/README.md) owns the operation, local method and route.
