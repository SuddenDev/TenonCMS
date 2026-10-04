# collections

`config/` defines collection options and the typed `defineCollection()` helper. `operations/` owns each action, and `operations/local/` binds the action to a CMS scope. `endpoints/` maps HTTP requests onto that local API.

For a create, follow `endpoints/create.endpoint.ts` → `operations/local/create.local.ts` → `operations/create.operation.ts` → `../content/writes/write-document.ts`.

Local wrappers check names, media write restrictions and draft eligibility. Operations retain lifecycle hooks and transaction reuse. `find.operation.ts` keeps the list, newest-match and ID variants together because their operation-hook arguments differ while they share the read pipeline.

`endpoints/routes.ts` assembles public reads and protected writes. Its mount order preserves create/draft, preview URL, update/draft, publish, discard and delete routing.
