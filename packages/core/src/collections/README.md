# Collections

This module defines collections and handles document operations. Local API methods bind operations to a CMS scope; HTTP endpoints expose those methods. Shared validation, hooks and persistence live in [content](../content/README.md).

## Follow a create

`POST /api/cms/collections/posts` flows through:

`endpoints/create.endpoint.ts` → `operations/local/create.local.ts` → `operations/create.operation.ts` → `content/writes/write-document.ts`

The local method checks that the collection exists, is writable, and supports drafts when requested. The operation enters the shared content lifecycle; the writer handles validation, hooks and persistence. A server call to `cms.create()` starts at the local method.

## Files

| Path                | Responsibility                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `config/`           | Collection options and `defineCollection()`, which preserves field and hook types.             |
| `operations/local/` | Bind API methods to a scope and check collection-specific rules.                               |
| `operations/`       | Run reads, writes, publish, discard and delete through the content engine.                     |
| `endpoints/`        | Parse HTTP requests and call the scoped local API. `routes.ts` groups public reads and writes. |

`find.operation.ts` keeps list, newest-match and ID reads together because they share the read pipeline but pass different hook arguments. Drafts are enabled by default; set `drafts: false` on a collection to disable them.
