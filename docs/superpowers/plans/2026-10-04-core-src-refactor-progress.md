# Core source refactor progress

Status: structural migration complete on `refactor/core-src-structure`. All source rounds are reviewed and committed. The architectural add-ons remain separate follow-up work.

## Baseline: 2026-10-04

The structural migration follows `2026-10-04-core-src-structure-plan.md`. The add-ons remain separate follow-up work. Baseline work changes no source behavior.

### Verification

| Command             | Outcome                                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`         | PASS: 39 test files pass, 1 skips; 520 tests pass, 2 skip. The hooks suite deliberately logs an error when testing a throwing `afterError` hook.               |
| `pnpm typecheck`    | PASS: core declarations and admin production build complete; all six workspace type checks pass. It started before active development servers were discovered. |
| `pnpm -r typecheck` | PASS: all six workspace checks pass using the watcher-safe command from `CLAUDE.md`.                                                                           |
| `pnpm build`        | Pending coordination with active development processes; not run by the baseline agent.                                                                         |

The declaration build warns that tsdown's `external` option is deprecated and reports the bundled `idiomorph` dependency. These warnings precede the refactor.

`lsof -nP -iTCP -sTCP:LISTEN` and `lsof -a -p 22875,22901,39519,59468 -d cwd -Fn` identify repository development servers: Astro on 4321, admin on 5173, standalone on 3200. A listener on 3000 belongs to another repository. The root agent also identifies active core watcher PID 22927. The listener listing alone establishes active dev servers, not whether every build watcher is active. Follow the watcher guidance in `CLAUDE.md` before another clean package build.

### HTTP route and security inventory

All routes below live under `/api/cms`. Registration order MUST remain:

1. `withCms` and plugin public middleware, in plugin order.
2. GET/POST `/auth/*`, delegated to better-auth.
3. Public plugin routes, media reads, collection reads, global reads.
4. CSRF, session verification, protected plugin middleware, in plugin order.
5. `/schema`, preview perspective endpoints, protected plugin routes, media writes, collection writes, global writes.

The session middleware supplies the user and a user-scoped local API. Public content reads independently resolve a session only when a cookie exists; a session failure becomes an anonymous read. Draft visibility requires both a valid session and the draft perspective cookie. Anonymous read results strip private fields recursively through groups, populated relations, and joins. Trusted local calls preserve their current privileges.

| Owner       | Public routes                                                                             | Protected routes                                                                                                                                                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collections | GET `/collections/:name`, GET `/collections/:name/:id`                                    | POST `/collections/:name`, POST `/collections/:name/draft`, POST `/collections/:name/preview-url`, PUT `/collections/:name/:id`, PUT `/collections/:name/:id/draft`, POST `/collections/:name/:id/publish`, DELETE `/collections/:name/:id/draft`, DELETE `/collections/:name/:id` |
| Globals     | GET `/globals/:name`                                                                      | POST `/globals/:name/preview-url`, PUT `/globals/:name`, PUT `/globals/:name/draft`, POST `/globals/:name/publish`, DELETE `/globals/:name/draft`                                                                                                                                  |
| Preview     | None                                                                                      | POST and DELETE `/preview`                                                                                                                                                                                                                                                         |
| Schema      | None                                                                                      | GET `/schema`                                                                                                                                                                                                                                                                      |
| Media       | GET `/media/folders`, GET `/media/files/:key{.+}`, conditional GET `/media/img/:path{.+}` | POST `/media/uploads`, PUT `/media/uploads/:id/parts/:n`, POST `/media/uploads/:id/complete`, DELETE `/media/uploads/:id`, POST `/media/folders/rename`, PATCH `/media/:id`, conditional POST `/media/:id/regenerate`, DELETE `/media/:id`                                         |
| Plugins     | Each plugin's `publicRoutes` under `/<plugin.name>`                                       | Each plugin's `routes` under `/<plugin.name>`                                                                                                                                                                                                                                      |

Keep draft/preview route matching and ordering. Generic malformed JSON becomes `undefined`; media malformed JSON becomes `{}`. Collection create returns 201, media upload create/complete return 201, deletion returns 204, and discarding a never-published collection document returns 204. Missing update/publish targets return 404.

`/schema` removes executable hooks/preview configuration while keeping real field names called `hooks` or `preview`, admin metadata, media regeneration availability, and site configuration. Error serialization distinguishes validation (400), conflict (409), HTTP exceptions, and unexpected errors (generic 500).

Media file responses MUST retain `nosniff`, sandbox CSP, range handling, conditional rendering, allowlist checks, and hidden-key restrictions. Upload lookup MUST retain its user ownership check. Storage move compensation and database/hook timing are behavior invariants, not opportunities to redesign during extraction.

### Packaging and workspace inventory

`packages/core/package.json` contains 20 public export specifiers: `.`, `./client`, `./register`, `./astro`, `./nuxt`, `./admin`, `./admin/vue`, `./admin/react`, `./preview`, `./preview/vue`, `./preview/react`, `./vite`, `./presets`, `./plugins/redirects`, `./plugins/redirects/admin`, `./media/local`, `./media/s3`, `./media/ipx`, `./media/cloudflare`, and `./media/default`. Consumer specifiers and emitted targets MUST remain compatible.

`tsdown.config.ts` preserves separate media adapter/provider entries and external `integral-cms/media/default`. The local, IPX, and default-media exports use the `workerd` condition. The tsconfig and Vitest aliases resolve default media directly to its source.

Copied runtime files:

- Astro: `route.ts`, `middleware.ts`, `admin.astro`.
- Nuxt: the complete `integrations/nuxt/runtime` directory.
- Client: `register.d.ts`.
- Admin: `index.d.ts`, `icons.d.ts`, `default.ts`, `entry.ts`, `virtual.d.ts`. The admin build supplies `dist/admin/index.js`.

Admin source directly imports core internals. Check these consumers in every affected round:

- `modules/media/media.ts`: media name rules.
- `modules/documents/fields.ts`: schema condition helper.
- `shared/api.ts`: client factory/errors/types, schema types, import-free slug helper.
- `shared/composables/useMenu.ts`: admin menu helper and declaration types.
- `index.ts`, `router.ts`, `shared/options.ts`, `shared/components/Mount.vue`, `shared/components/Themed.vue`: admin declarations.

Framework adapters reference copied runtime paths and virtual config modules. Preserve source copies and their relative resolution when updating build entries.

### Test ownership and remaining proof at baseline

Existing integration suites exercise auth/session forgery, CSRF, protected and public plugins, malformed content bodies, visibility, drafts, preview URLs, hooks/nested calls, rollback, references, settings, population, and media lifecycle behavior. Existing media tests cover storage move compensation, partial folder rename recovery, file sandbox headers/ranges, modifier allowlists, upload lifecycle, and regeneration. Unit tests cover schema/type inference, conditions, population, query parsing, browser preview runtime/templates, media helpers/providers/adapters, admin helpers, and presets.

Mechanical extraction MUST reuse these tests and move colocated tests with their owner. For any new behavior or discovered coverage gap, write the failing test and observe RED before implementation; then run GREEN. Do not create one test per forwarding file merely because the file is new.

Remaining proof for the completed migration:

- Example and framework adapters have no automated behavior suite; use the smoke workflow in `CLAUDE.md`.
- Review endpoint extraction against the full route registration order; current tests cover representative plugin/middleware ordering rather than a complete route snapshot.
- Preserve schema serialization manually in review; existing tests cover metadata but are not a full executable-config serialization snapshot.
- Review media malformed-body behavior alongside content malformed-body tests; no dedicated media malformed-JSON regression was identified during this inventory.
- Live S3 coverage skips unless explicitly configured. No live S3 run occurred.
- Final public-entry imports, browser dependency boundaries, removed-path audit, lint, formatting, full builds, and example smoke checks remain required.

## Refactor rounds

### Round 0: Baseline and branch

Branch: `refactor/core-src-structure`, based on `af8a7c8`.

Commit: `33ed4ab`.

The baseline confirms existing tests, declarations, and workspace types pass. The user stops the core watcher; the root agent confirms PID 22927 is absent before subsequent clean builds. The route, packaging, and security inventory above guides each round's review.

### Round 1: Configuration and public contracts

Commit: `116b604`.

Extract CMS construction/options/API declarations, collection/global definitions, auth configuration, media configuration/API binding, and preview types. Public entry names and generic signatures remain compatible.

Review: all 285 baseline top-level function bodies match after ignoring whitespace/comments. Auth retains its first-user guard, forced email/password login, and fixed model names. Configuration assembly order, lazy initialization, media scope binding, and browser type-only imports remain intact. No new behavior requires RED–GREEN tests.

Proof: 114 focused tests pass; core type/declaration checks pass; root `pnpm typecheck` passes all six workspaces and both package builds; `pnpm lint` passes. No unresolved review findings.

### Round 2: Shared content, persistence, client, and preview

Commit: `d310d02`.

Extract the shared engine and named database queries. Split client requests/types/query serialization and preview store/DOM/runtime/templates/server resolution. Existing unit assertions move beside their owners.

Review: engine/query/migration bodies preserve their behavior. Three action functions inline the same draft-flag expression. Client requests keep per-instance state; `Register` remains at the public entry for module augmentation. Preview preserves its singleton state, message source/origin checks, observer cleanup, and server-safe entry. Internal deletion effects retain their existing validation exemptions.

Proof: root `pnpm test` passes 520 tests across 46 files, with the same two live-S3 skips; `pnpm typecheck`, `pnpm lint`, and `pnpm fmt:check` pass. Runtime import tracing finds no external client dependencies, only `idiomorph` for preview, and the expected Vue/React peers for framework entries. No unresolved review findings.

### Round 3: Feature entry points, media, schema, and adapter helpers

Commit: `ab14e25`.

Extract collection/global operations and scoped local wrappers, feature Hono endpoints, auth/request middleware, HTTP query/visibility/error helpers, and plugin contracts. Restructure media capabilities, schema validation/traversal/runtime/inference, and admin HTML/path/favicon/input helpers. Existing unit assertions remain colocated with their owners.

Review finds and resolves two issues:

- `/schema` serialization initially runs after public plugin route registration. A permanent regression test observes RED (`Before registration` expected, `After registration` received), then GREEN after restoring snapshot creation before plugin callbacks. Its route still mounts in its original protected position.
- The generic `uploads` Git ignore rule hides the new source folder. A narrow source-folder exception makes all eight upload files visible to Git, formatting, and lint; generated upload directories remain ignored.

The root review matches all 31 route definitions and preserves middleware order. All 284 non-assembly function bodies from round 2 match after ignoring whitespace/comments; the three changed assemblers bind extracted owners. Additional cross-review covers media compensation and transaction timing, upload ownership, private/query visibility, data-dependent validation, client instance state, and preview origin/source checks. No unresolved security or behavior findings.

Proof: root `pnpm test` passes 521 tests across 52 files, with the same two live-S3 skips; `pnpm typecheck` and `pnpm lint` pass. Browser runtime dependency tracing remains unchanged. Final example builds and runtime smoke checks follow in round 4.

### Round 4: Navigation, packaging, and production verification

The source overview maps all 17 modules and walks through a collection write, global read, upload completion, and preview URL. Module READMEs and `CLAUDE.md` describe the current paths, responsibility rules, and preserved runtime invariants. Static audits confirm every module README, source overview link, copied runtime file, and direct admin import resolves. Historical plans and specifications remain historical records.

Final proof:

| Check                          | Outcome                                                                                                                                                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                    | PASS: 521 tests across 52 files; two existing live-S3 tests skip without their configured environment.                                                                                                                                                      |
| `pnpm typecheck`               | PASS: package declarations, admin build, and all six workspace type checks.                                                                                                                                                                                 |
| `pnpm lint`                    | PASS.                                                                                                                                                                                                                                                       |
| `pnpm fmt:check`               | PASS, including Astro formatting.                                                                                                                                                                                                                           |
| `pnpm build`                   | PASS: core, admin, and all four examples.                                                                                                                                                                                                                   |
| Public package surface         | All 20 specifiers and 42 emitted targets exist; 18 runtime entries import successfully. The type-only register entry passes type checks; the admin SPA passes build and HTTP serving checks. Export mappings and optional peer metadata match the baseline. |
| Browser and Workerd boundaries | Emitted client/preview dependencies contain no server imports. Local, IPX, and default-media entries retain their expected Workerd behavior.                                                                                                                |
| Production example smoke tests | All four examples pass with isolated temporary databases/storage: first-user signup, protected anonymous 401, content create/public read, admin HTML/assets, preview cookie, and draft visibility. Dynamic framework pages render draft content.            |
| Production media smoke         | Standalone PNG upload/part/completion, dimensions, original bytes, 206 range, sandbox/nosniff headers, and WebP variant pass.                                                                                                                               |

The smoke servers stop after verification. Smoke tests leave existing example data and development processes untouched. TanStack's build regenerates its route tree using its own formatting; applying the repository formatter restores the tracked file with no diff.

No unresolved correctness, security, or architecture findings remain from the refactor reviews. Live S3 verification is the only environment-dependent test omission. The five architectural add-ons are intentionally outside this structural migration.
