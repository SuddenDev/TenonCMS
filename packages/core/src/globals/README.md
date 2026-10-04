# globals

`config/` defines global options and the typed `defineGlobal()` helper. `operations/` owns get, set, publish and discard actions. `operations/local/` checks the name and draft eligibility while binding the current user, perspective, context and transaction.

For a read, follow `endpoints/get.endpoint.ts` → `operations/local/get.local.ts` → `operations/get.operation.ts` → `../content/reads/read-global.ts`.

`endpoints/routes.ts` assembles public reads and protected preview URL, set/draft, publish and discard routes. Globals keep their existing lifecycle differences from collections.
