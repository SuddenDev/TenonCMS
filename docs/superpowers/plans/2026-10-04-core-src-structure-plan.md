# Plan: Restructure the core source folder

Date: 2026-10-04. Scope: `packages/core/src/` and the imports, build settings, tests, and documentation affected by its restructuring.

Status: structural migration complete. Verification and round reviews are recorded in [the progress report](2026-10-04-core-src-refactor-progress.md). The architectural add-ons remain separate follow-up work.

## Overview

- Organize the backend by feature, with subfolders for configuration, endpoints, operations, and local API wrappers.
- Use role suffixes for repeated action names: `create.endpoint.ts`, `create.operation.ts`, and `create.local.ts`.
- Give each file one main exported responsibility. Keep closely related private helpers together.
- Preserve the public API, HTTP behavior, storage format, and shared content pipelines throughout the migration.
- Complete the structural migration before taking on the architectural add-ons at the end of this document.

## 1. Architectural decisions

Use a modular monolith inspired by Payload's organization. Collections, globals, media, auth, and preview are feature modules. Hono provides the HTTP adapter. Plain functions implement the operations.

References: [Payload's collections module](https://github.com/payloadcms/payload/tree/main/packages/payload/src/collections) and [Hono's guidance for larger applications](https://hono.dev/docs/guides/best-practices#building-a-larger-application).

Collections and globals get separate entry points, while `content/` owns the engine they share. There MUST NOT be a separate backend module for every collection configured by a host application.

An operation follows this path:

```text
HTTP endpoint -> scoped local API -> feature operation -> shared content pipeline -> database query
Server code ---------------------> local API ---------^
Nested hook ---------------------> transaction-bound local API
```

The local wrapper binds the CMS instance and call context. The feature operation coordinates its use case. The shared pipeline owns validation, field processing, population, and common persistence behavior. Each layer MUST retain a concrete responsibility; do not create forwarding files solely to make folders look symmetrical.

Auth continues to use better-auth. Its provider endpoint remains one delegated handler; this migration MUST NOT recreate login, registration, or password operations already implemented by better-auth.

Keep `cms/` for instance construction and API assembly. Put `defineCms()` in `cms/create-cms.ts`, rather than expanding the root folder. Root `index.ts` remains the public export barrel, and `errors.ts` remains browser-safe.

## 2. Naming and file-size rules

| Responsibility          | Example                    | Rule                                                                       |
| ----------------------- | -------------------------- | -------------------------------------------------------------------------- |
| HTTP endpoint           | `create.endpoint.ts`       | One route responsibility; closely related route variants MAY share a file. |
| Application operation   | `create.operation.ts`      | One use case, with its necessary private helpers.                          |
| Bound local API method  | `create.local.ts`          | Bind instance and call context to the operation.                           |
| Database query          | `find-documents.query.ts`  | One query responsibility; keep its SQL construction helpers nearby.        |
| Middleware              | `session.middleware.ts`    | One middleware responsibility.                                             |
| Descriptive helper      | `check-references.ts`      | No extra suffix when the name already explains its purpose.                |
| Types                   | `types.ts`, `options.ts`   | Types MAY be grouped by the contract they describe.                        |
| Unit test               | `create.operation.test.ts` | Match the source basename and colocate the test.                           |
| Package or module entry | `index.ts`                 | Export declarations only, except framework-owned entry conventions.        |

Use kebab-case for names with several words, consistent with existing helpers such as `seo-meta.ts` and `nested-paths.ts`.

Prefer one or two exported functions per implementation file. This is a responsibility rule, not a hard count of every nested function or callback. A route registration function, a bound API factory, and a recursive traversal can have private helpers without another file for each helper.

Files MUST NOT encode their complete folder path. Use `operations/local/create.local.ts`, rather than `operations.local.create.ts`.

Do not impose a line limit or split a coherent pipeline into fragments solely to make its files smaller. Read and write stage order MUST remain visible in their orchestration functions.

Public package entry files and copied framework runtime files are exceptions to blanket renaming. Preserve their names where they carry an integration or packaging contract.

## 3. Target layout

The tree shows the intended module boundaries and representative files. The operation inventories below define the remaining action files. Do not create empty folders or placeholder files.

```text
packages/core/src/
  index.ts
  errors.ts
  README.md
  cms/
    index.ts
    create-cms.ts
    config/
      options.ts
      add-settings.ts
    api/
      bind-api.ts
      types.ts
    runtime/
      types.ts
      operation-context.ts
      transaction.ts
  collections/
    index.ts
    config/
      types.ts
      define-collection.ts
    endpoints/
      routes.ts
      find.endpoint.ts
      find-by-id.endpoint.ts
      create.endpoint.ts
      update.endpoint.ts
      delete.endpoint.ts
      publish.endpoint.ts
      discard.endpoint.ts
      preview-url.endpoint.ts
    operations/
      find.operation.ts
      create.operation.ts
      update.operation.ts
      delete.operation.ts
      publish.operation.ts
      discard.operation.ts
      local/
        find.local.ts
        find-one.local.ts
        find-by-id.local.ts
        create.local.ts
        update.local.ts
        delete.local.ts
        publish.local.ts
        discard.local.ts
  globals/
    index.ts
    config/
      types.ts
      define-global.ts
    endpoints/
      routes.ts
      get.endpoint.ts
      set.endpoint.ts
      publish.endpoint.ts
      discard.endpoint.ts
      preview-url.endpoint.ts
    operations/
      get.operation.ts
      set.operation.ts
      publish.operation.ts
      discard.operation.ts
      local/
        get.local.ts
        set.local.ts
        publish.local.ts
        discard.local.ts
  content/
    targets.ts
    lifecycle/
      run-operation.ts
      collect-hooks.ts
      hook-args.ts
    reads/
      read-documents.ts
      read-global.ts
      read-results.ts
      run-read-hooks.ts
    writes/
      write-document.ts
      remove-document.ts
      publish-document.ts
      discard-draft.ts
    population/
      populate.ts
      population-spec.ts
      select-fields.ts
      validate-select.ts
    integrity/
      check-references.ts
      check-unique.ts
      apply-on-delete.ts
      find-references.ts
  auth/
    create-auth.ts
    get-caller.ts
    config/
      options.ts
      build-options.ts
    endpoints/
      provider.endpoint.ts
    middleware/
      session.middleware.ts
  http/
    index.ts
    app.ts
    errors.ts
    parse-body.ts
    read-request.ts
    strip-private-fields.ts
    middleware/
      types.ts
      with-cms.middleware.ts
    query/
      parse-populate.ts
      parse-select.ts
      where-from-query.ts
      read-options.ts
      visibility.ts
  db/
    index.ts
    types.ts
    create-db.ts
    map-document.ts
    adapters/
      libsql.ts
    migrations/
      cms.ts
      migrate.ts
    queries/
      documents/
        find-documents.query.ts
        load-document.query.ts
        insert-document.query.ts
        update-document.query.ts
        delete-document.query.ts
      globals/
      drafts/
      references/
      media/
      document-sql.ts
  media/
    index.ts
    api.ts
    config/
      options.ts
      collection.ts
    runtime/
      create-media-core.ts
      run-media-hooks.ts
      read-media.ts
    endpoints/
      routes.ts
      files.endpoint.ts
      images.endpoint.ts
      folders.endpoint.ts
      uploads.endpoint.ts
      update.endpoint.ts
      delete.endpoint.ts
      regenerate.endpoint.ts
    operations/
      update.operation.ts
      rename-folder.operation.ts
      delete.operation.ts
      folders.operation.ts
      regenerate.operation.ts
      uploads/
        create.operation.ts
        put-part.operation.ts
        complete.operation.ts
        abort.operation.ts
        upload.operation.ts
        get-upload.ts
        upload-data.ts
    library/
      names.ts
      names-in.ts
    images/
      types.ts
      dimensions.ts
      variants-for.ts
      modifiers.ts
      allowlist.ts
      parse-image-path.ts
      decorate.ts
      ipx.ts
      cloudflare.ts
    variants/
      keys.ts
      render-variant.ts
      render-all.ts
      move-variants.ts
      delete-variants.ts
    storage/
      types.ts
      local.ts
      s3.ts
    default.ts
    workerd.ts
  schema/
    index.ts
    config/
      types.ts
    endpoints/
      read.endpoint.ts
    fields/
      field-schema.ts
    hooks/
    validation/
      check-schema.ts
      build-data-schema.ts
      parse-data.ts
    traversal/
      each-field.ts
      reference-fields.ts
      relation-paths.ts
      inner-fields.ts
      map-value.ts
      field-at.ts
      filterable.ts
    runtime/
      apply-defaults.ts
      fill-slugs.ts
      validate-fields.ts
      run-field-hooks.ts
      run-hooks.ts
    inference.ts
    condition.ts
  preview/
    index.ts
    config/
      types.ts
    endpoints/
      enter.endpoint.ts
      exit.endpoint.ts
    server/
      resolve-url.ts
    templates/
      placeholders.ts
      resolve-template.ts
    runtime/
      preview.ts
      store.ts
      merge-draft.ts
      bind-elements.ts
      bars.ts
    vue.ts
    react.ts
  client/
    index.ts
    create-client.ts
    create-request.ts
    types.ts
    errors.ts
    constants.ts
    query/
      read-query.ts
    register.d.ts
  plugins/
    index.ts
    types.ts
    define-plugin.ts
    merge-plugins.ts
    http/
      mount-routes.ts
      collect-middleware.ts
    redirects/
  admin/
  integrations/
  presets/
  helpers/
  tests/
```

Each top-level module MUST have a short README describing its responsibility, entry points, and dependencies. A README is not required for every nested folder.

`content/` contains the existing shared engine, not a second CMS API. `cms/runtime/types.ts` initially retains the current `Core`, `Scope`, and `Inner` contracts. Narrowing those contracts belongs to add-on 1.

Existing `schema/fields/`, hook type files, storage adapters, image providers, presets, helpers, and framework runtime layouts already have useful boundaries. Keep them unless the specific mapping below requires a move.

## 4. Operation and endpoint inventories

### Collections

| Action      | Endpoint responsibility                                                | Local API and operation responsibility                                                      |
| ----------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Find        | List documents, parse filters and read options, filter private fields. | `find`; `findOne` and `findById` MAY reuse the find operation with distinct local wrappers. |
| Find by ID  | Read one document and preserve the HTTP 404 behavior.                  | Preserve the local API's missing-document result.                                           |
| Create      | Create a published document or save a new draft.                       | One create operation with the existing draft option.                                        |
| Update      | Update published content or save a draft.                              | One update operation with the existing draft option.                                        |
| Delete      | Delete a document.                                                     | Preserve hooks, transactions, and reference effects.                                        |
| Publish     | Publish the pending draft.                                             | Use the existing shared write pipeline.                                                     |
| Discard     | Discard a draft.                                                       | Preserve the special case that deletes a never-published document.                          |
| Preview URL | Resolve the URL from unsaved form state.                               | Delegate to the preview server helper; do not invent a new public local API method.         |

Keep published and draft create routes in `create.endpoint.ts`, and published and draft update routes in `update.endpoint.ts`. These variants share a use case and MUST retain their different paths and options.

### Globals

| Action      | Endpoint responsibility                                              | Existing public local method                        |
| ----------- | -------------------------------------------------------------------- | --------------------------------------------------- |
| Get         | Read the named global with read options and private-field filtering. | `getGlobal`                                         |
| Set         | Save published content or a draft.                                   | `setGlobal`                                         |
| Publish     | Publish the pending global draft.                                    | `publishGlobal`                                     |
| Discard     | Discard the pending global draft.                                    | `discardGlobal`                                     |
| Preview URL | Resolve the URL from unsaved form state.                             | Preview server helper, without a new public method. |

### Other endpoints

| Owner   | Responsibility                                                                                                  |
| ------- | --------------------------------------------------------------------------------------------------------------- |
| Auth    | Delegate the existing `/auth/*` routes to better-auth.                                                          |
| Schema  | Serve the existing protected `/schema` response. Put its endpoint in `schema/endpoints/read.endpoint.ts`.       |
| Preview | Set and clear the preview perspective cookie.                                                                   |
| Media   | Serve files, images, and folders; handle uploads, metadata updates, deletion, folder renames, and regeneration. |
| Plugins | Mount each plugin's public and protected route groups under its name.                                           |

Endpoint files SHOULD register a typed Hono sub-app with the handler beside its route definition. `routes.ts` assembles those sub-apps into the feature's public reads and protected writes. Avoid extracting handlers into a bare `Context` signature that loses inferred path parameters. This migration MUST preserve the existing custom client rather than introduce Hono RPC.

## 5. Migration map

All paths in this table are relative to `packages/core/src/`.

| Current source                          | Destination and extraction                                                                                                                                                                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cms/index.ts`                          | `cms/create-cms.ts`; extract settings assembly into `cms/config/add-settings.ts`. Keep `cms/index.ts` as an export barrel.                                                                                                                            |
| `cms/options.ts`                        | `cms/config/options.ts`; retain generic inference and defaults.                                                                                                                                                                                       |
| `cms/api.ts`                            | `cms/api/types.ts`, `cms/api/bind-api.ts`, and the collections/global local wrappers.                                                                                                                                                                 |
| `cms/scope.ts`                          | Runtime contracts and context/transaction helpers in `cms/runtime/`; target guards in `content/targets.ts`; hook selection and arguments in `content/lifecycle/`.                                                                                     |
| `cms/run.ts`                            | `content/lifecycle/run-operation.ts`, including its existing error-hook behavior.                                                                                                                                                                     |
| `cms/read.ts`                           | Shared readers and read-hook processing in `content/reads/`.                                                                                                                                                                                          |
| `cms/write.ts`                          | Collections/global feature operations and the shared write, delete, publish, and discard pipelines in `content/writes/`.                                                                                                                              |
| `cms/populate.ts`                       | Population, population specification, selection, and selection validation in `content/population/`.                                                                                                                                                   |
| `cms/refs.ts`                           | Reference validation, uniqueness, reference discovery, and deletion effects in `content/integrity/`.                                                                                                                                                  |
| `cms/auth.ts`                           | `auth/create-auth.ts`, `auth/config/options.ts`, and `auth/config/build-options.ts`.                                                                                                                                                                  |
| `http/index.ts`                         | `http/app.ts`; distribute endpoints to feature folders and extract request parsing, read handling, error mapping, and response filtering.                                                                                                             |
| `http/middleware.ts`                    | Session and caller helpers in `auth/`; Hono environment and CMS binding in `http/middleware/`; plugin middleware collection in `plugins/http/`.                                                                                                       |
| `http/query.ts`                         | `http/query/`; preserve the distinction between public and admin visibility.                                                                                                                                                                          |
| `db/index.ts`                           | Connection factory, types, row mapping, libsql dialect, and migrations in the corresponding `db/` subfolders.                                                                                                                                         |
| `db/documents.ts`                       | Named `.query.ts` files grouped by documents, globals, drafts, references, and media. Keep common perspective and SQL expressions in `db/queries/document-sql.ts`.                                                                                    |
| `media/index.ts`                        | Media configuration, collection definition, and API assembly; keep the public barrel and existing media API contract.                                                                                                                                 |
| `media/core.ts`                         | `media/runtime/`.                                                                                                                                                                                                                                     |
| `media/http.ts`                         | `media/endpoints/`; keep file serving and range processing with the file endpoint.                                                                                                                                                                    |
| `media/upload.ts`                       | Existing upload stages in `media/operations/uploads/`; keep associated private processing helpers together.                                                                                                                                           |
| `media/library.ts`                      | Separate metadata update, folder rename, delete, folder listing, and name lookup responsibilities.                                                                                                                                                    |
| `media/images.ts`                       | `media/images/` helpers and types; retain provider entry files.                                                                                                                                                                                       |
| `media/variants.ts`                     | `media/variants/`; regeneration moves to `media/operations/regenerate.operation.ts`.                                                                                                                                                                  |
| `media/names.ts`, `media/dimensions.ts` | `media/library/names.ts`, `media/images/dimensions.ts`, with their tests.                                                                                                                                                                             |
| `schema/index.ts`                       | Collection/global config contracts and definition helpers move to their feature folders. `Schema` moves to `schema/config/types.ts`; `Preview` to `preview/config/types.ts`. Keep existing re-exports through `schema/index.ts` and the package root. |
| `schema/types.ts`                       | `schema/inference.ts`, with its type tests. Keep the type expressions and public export names.                                                                                                                                                        |
| `schema/fields/index.ts`                | Move the runtime `fieldSchema()` dispatcher to `schema/fields/field-schema.ts`; preserve the field type exports through the barrel.                                                                                                                   |
| `schema/validate.ts`                    | Startup validation, data-schema construction, and parsing in `schema/validation/`.                                                                                                                                                                    |
| `schema/walk.ts`                        | Structural walkers in `schema/traversal/`; defaults, slugs, validation callbacks, and field hooks in `schema/runtime/`.                                                                                                                               |
| `schema/hooks/run.ts`                   | `schema/runtime/run-hooks.ts`; keep the related `list()` helper nearby.                                                                                                                                                                               |
| `preview/index.ts`                      | A browser-safe barrel over runtime connection, store, draft merge, DOM binding, and bar responsibilities.                                                                                                                                             |
| `preview/template.ts`, `preview/url.ts` | Pure template helpers in `preview/templates/`; URL resolution in `preview/server/`.                                                                                                                                                                   |
| `client/index.ts`                       | A browser-safe barrel over the existing client factory, request factory, types, errors, constants, and query serialization.                                                                                                                           |
| `plugins/index.ts`                      | Contract types, plugin definition, schema merging, and a public barrel.                                                                                                                                                                               |
| `plugins/redirects/index.ts`            | Separate plugin construction and redirect resolution where useful; keep the package entry and public-only dependency rule.                                                                                                                            |
| `admin/`                                | Preserve copied declarations and entry files. Split `html.ts` into render/path/favicon helpers if needed for one main responsibility per implementation file.                                                                                         |
| `integrations/`, `presets/`, `helpers/` | Preserve existing organization and public entries; update references to moved core files.                                                                                                                                                             |
| `tests/`                                | Preserve the integration suite and fixture helpers; update imports. Move unit tests alongside the extracted responsibilities they cover.                                                                                                              |

Direct upload-table SQL currently inside media operations can remain there during the structural migration. Moving its persistence responsibilities belongs to add-on 4. Persistence isolation requires that follow-up work, beyond moving folders.

## 6. Invariants

| Area                   | Required preservation                                                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public package surface | Existing import paths, export names, method signatures, optional peers, and generated declarations MUST continue to work.                                                           |
| HTTP                   | Paths, methods, statuses, response bodies, error mappings, and missing-document behavior MUST remain equivalent.                                                                    |
| Middleware             | Preserve CMS binding and public plugin middleware, auth/public routes, then CSRF, session, protected plugin middleware, and protected routes. Preserve each route group's ordering. |
| Access                 | Reads remain public with the current visibility checks; writes remain protected. Local server calls retain their current trust model.                                               |
| Drafts                 | Preserve draft validation differences, publish/discard behavior, cookie semantics, and request perspective handling.                                                                |
| Hooks                  | Preserve field, feature, plugin, and root ordering; nested calls share user, transaction, perspective, and context. Globals retain their current operation-hook differences.        |
| Transactions           | Preserve transaction reuse, commit/rollback timing, and outermost error-hook behavior.                                                                                              |
| Media                  | Preserve upload ownership, key reservations, file/database sequencing, rollback compensation, variants, and cleanup behavior.                                                       |
| Schema                 | Preserve generic inference, relation/select validation, field conditions, and the two validation passes around write hooks.                                                         |
| Database               | Preserve tables, JSON layout, migration keys and content, indexes, and perspective-specific queries.                                                                                |
| Browser entries        | Client, preview, import-free helpers, and condition evaluation MUST retain their runtime dependency restrictions and import behavior.                                               |
| Integrations           | Preserve copied runtime files, virtual module names, admin paths, and the host's config resolution.                                                                                 |

The structural migration MUST NOT introduce a new authorization model, change hook timing, add database adapters, or alter query results. Those decisions belong to the add-ons.

## 7. Execution phases

Every phase MUST update affected imports, build/test mappings, copied-file references, and direct imports from other workspaces before validation. Phase 7 audits those updates; it is not a reason to postpone them. Use small mechanical moves and extractions, and keep each phase working before starting the next.

### Phase 0: Record the baseline

Inspect the current worktree and coordinate any overlapping work before moving files. Record the existing package export map, HTTP route inventory, build entries, copied files, test coverage, and source imports from other workspaces. This document describes the source inspected on 2026-10-04; the implementation MUST account for later changes, especially preview work.

Run the current tests and type/build checks before restructuring. Record pre-existing failures separately. Reuse current assertions; add a behavior test only where extraction affects an important boundary with no existing coverage. Do not write tests that merely assert the new folder names.

Deliverable: a baseline against which every phase can be checked.

### Phase 1: Separate configuration and contracts

Extract CMS options, collection/global definitions, preview configuration types, auth options, media options, and typed local API declarations into their destination files. Turn applicable entry files into barrels without changing their exports.

Keep public generic signatures and JSDoc attached to their declarations. Browser imports MUST remain type-only wherever the underlying modules contain server dependencies. Preserve the existing type-test protections against inference changes and excessive type instantiation.

Deliverable: named contracts and configuration ownership, with runtime behavior unchanged. Validate with type checks and declaration generation.

### Phase 2: Extract the shared content engine

Move call context and transaction helpers, lifecycle orchestration, readers, writers, population, and integrity functions according to the migration map. Keep existing functions' inputs and stage order during extraction.

Split persistence functions into the `db/queries/` groups. Reuse common SQL expressions; do not copy them into each query file. Extract the database dialect and migrations without editing any shipped migration body or key.

Update all callers, including media and preview, in the same phase. New internal code SHOULD import the owning leaf module, avoiding runtime imports through the package root. Removing existing cross-feature coupling is deferred to add-on 1.

Deliverable: the current engine in focused subfolders. Validate reads, writes, drafts, references, population, hooks, root hooks, and database tests.

### Phase 3: Establish collections and globals modules

Move action-level coordination into feature operation files. Move the existing bound local methods into `.local.ts` files. Keep `bind-api.ts` as the small assembler of the public local API, including `drafts()` and the optional media API.

Preserve the current name checks, media-write restrictions, draft eligibility checks, and missing-result handling. A local wrapper MUST bind the supplied scope rather than start a new transaction or lose nested-hook context.

Keep collection and global feature operations separate while reusing the common content engine. `findOne` and `findById` can retain their current reuse of the shared read path.

Deliverable: every public content method has a predictable feature owner and local wrapper. Validate local API behavior and inferred return types.

### Phase 4: Extract Hono endpoints and middleware

Move HTTP handlers into feature-owned endpoint files and assemble their public/protected groups. Keep `http/app.ts` focused on mounting, middleware order, and error handling.

Preserve inline Hono route inference, plugin registration order, draft route matching, private-field handling, and malformed-body behavior. The generic API currently parses malformed JSON differently from media; extraction MUST preserve those differences until a separate behavior change is approved.

Keep preview URL routes with collections/globals, perspective-cookie routes with preview, and `/schema` with schema. The schema response MUST keep its existing omission of executable configuration and its admin metadata.

Deliverable: feature endpoints can be found without reading the entire HTTP application. Validate through the existing client-driven integration suite, including auth, plugins, preview, drafts, and media.

### Phase 5: Restructure media internals

Separate upload stages, library operations, image helpers, and variant management. Keep adapter/provider entry files and `media/default.ts` and `media/workerd.ts` stable where practical.

Media API binding can initially remain one factory in a named `media/api.ts` file. Do not add a local wrapper for every media action merely to duplicate the collections layout; its existing factory already binds the scope.

Preserve storage and database sequencing, compensation on a failed move, partial folder-rename results, upload cleanup, regeneration behavior, and public file headers/range responses. Follow the existing media rules rather than introducing a new recovery architecture in this phase.

Deliverable: each media capability has a clear owner, with storage behavior unchanged. Validate existing media, adapter, image, variant, and upload coverage. Live S3 checks require the existing configured environment and are not a default migration requirement.

### Phase 6: Restructure schema, browser code, and remaining modules

Separate startup/schema validation from data validation. Extract traversal, field processing, and the field-schema dispatcher into their destination files. Keep one implementation of recursive walking and population/selection rules. Data-schema construction MUST retain its dependence on actual values and conditions; do not replace it with static startup compilation.

Split the client factory from declarations, request handling, errors, and query serialization. Preserve its closures and the existing API; a split MUST NOT add global request state.

Split preview runtime responsibilities while preserving its singleton store, listener identity, idempotent startup/cleanup, trusted origins, DOM reporting, and server-safe import behavior. Browser preview entries MUST NOT re-export the server URL resolver.

Finish plugin contract extraction and any useful admin HTML helper splits. Leave already-focused presets, render helpers, provider adapters, and framework runtime layouts alone.

Deliverable: large mixed-responsibility files have clear internal boundaries, with browser and integration behavior intact.

### Phase 7: Verify packaging and document navigation

Update `packages/core/tsdown.config.ts`, `packages/core/package.json`, `packages/core/tsconfig.json`, and `packages/core/vitest.config.ts` for any moved source paths. Preserve consumer-facing package specifiers and workerd conditions. If generated output paths change, update their export mappings and integration references together.

Update direct imports in `packages/admin`, including schema conditions/types, media name helpers, client exports, menu helpers, and admin declarations. Check framework adapter references to copied source files and virtual modules. Do not bulk-rewrite historical plans or specs; update active documentation and current code references.

Replace the source overview with the new directory map and concrete navigation examples: creating a collection document, reading a global, completing an upload, and resolving a preview URL. Update module READMEs and the affected architecture/convention text in `CLAUDE.md`. Its current instruction to keep file counts small MUST reflect the agreed responsibility-based rule.

Remove obsolete implementation files and migration-only re-export shims once all internal callers move. Public package entry barrels remain. Each phase SHOULD be reviewable and keep the repository working before the next starts.

Deliverable: a complete migration with no unresolved active imports to removed files and a documented path into each feature.

## 8. Verification and completion

Run focused tests after each affected phase. The full checks below apply to the completed source migration, not to writing this plan.

| Check                                       | Command or method                                                                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core integration and unit tests             | `pnpm test`                                                                                                                                                                         |
| Workspace type checks and declaration build | `pnpm typecheck`; while a dev watcher runs, follow the existing `pnpm -r typecheck` convention and run the final declaration build after coordinating the watcher.                  |
| Lint                                        | `pnpm lint`                                                                                                                                                                         |
| Formatting                                  | `pnpm fmt:check`                                                                                                                                                                    |
| Package and example builds                  | `pnpm build`                                                                                                                                                                        |
| Public entry compatibility                  | Inspect every existing package export and its generated file; smoke-import root, client, preview, presets, plugins, framework integrations, and media entries in suitable runtimes. |
| Browser dependencies                        | Check client/preview output and the admin build for accidental server imports; preserve condition/helper import restrictions.                                                       |
| Framework smoke checks                      | Follow the existing example smoke workflow in `CLAUDE.md`, covering API reads/writes, auth, admin serving, and preview.                                                             |
| Migration completeness                      | Search active source, configuration, and READMEs for removed paths; verify each result instead of assuming every matching string is obsolete.                                       |

Completion requires equivalent public behavior, working existing import paths, green relevant tests and builds, colocated unit tests, updated module maps, and no duplicate implementation left behind.

No source migration is complete merely because the new folder tree exists. The meaningful result is that a developer can follow an operation and change its implementation without guessing which module owns it.

## 9. Add-ons

These are follow-up architectural improvements, ordered by priority. They are separate from the structural migration because they can change contracts, behavior, or failure semantics. Each add-on needs a focused design and verification of its intended behavior before implementation.

### Add-on 1: Clear module contracts and dependency direction

**Goal:** let a feature change without requiring knowledge of another feature's private pipeline.

The current media code calls content write/delete internals, and content reads call media decoration logic. The broad `Core` object also carries several modules' state.

Define narrow contracts for shared document persistence, media read decoration, and call context. Keep instance assembly in `create-cms.ts`. Inject the required capabilities through ordinary arguments or small objects; do not introduce a dependency injection container. Retain common content behavior rather than duplicating it inside media.

**Done when:** transport-independent operations have explicit dependencies, cross-feature calls use named contracts, and private implementation imports are limited to their owning module. Add lightweight import-boundary checks only for rules worth enforcing.

### Add-on 2: Consistent access policy across entry points

**Goal:** make trust and visibility rules explicit for HTTP, framework request APIs, plugin routes, and trusted server calls.

Private-field filtering currently lives in HTTP, while the local API serves trusted callers. Decide which request-scoped operations enforce visibility and any future authorization, and how a trusted server call explicitly uses its current privileges. Preserve the distinction between authenticating a user and authorizing an operation.

Keep HTTP session/CSRF handling at the transport boundary. Put applicable document and field policy in the shared operation path so another request adapter does not need its own copy.

**Done when:** equivalent request-scoped calls share policy, trusted calls have a documented mode, populated results apply the same visibility rules, and plugins do not need to reconstruct core policy.

### Add-on 3: Explicit transaction and side-effect boundaries

**Goal:** distinguish changes that participate in rollback from effects that occur after a successful commit.

Current write hooks run inside the transaction. Media operations also coordinate a database with external storage, which cannot be rolled back by the database alone.

Define lifecycle semantics for transactional hooks, post-commit effects, and errors. Specify what nested calls inherit, how storage compensation works, and how partial failures can be retried. Do not silently move existing `afterChange` hooks outside the transaction; that would alter their contract.

Start with explicit timing and a small post-commit capability if needed. Add a durable outbox only when a real requirement demands effects survive process failure.

**Done when:** a hook author can tell whether an effect sees committed data, whether it can roll back the write, and what happens if storage or a post-commit effect fails.

### Add-on 4: Deliberate persistence and query ownership

**Goal:** define predictable query cost, persistence ownership, concurrency behavior, and integrity guarantees as content grows.

Keep the existing SQLite/libsql backend. Consolidate remaining media upload-table queries under a clear persistence owner. Establish pagination and expansion policies, preserve existing population batching, and review repeated uniqueness/reference scans and concurrent media edits against expected workloads.

Use database constraints and indexes where they fit the schema model. Decide whether write conflict detection or per-document coordination is needed before choosing a mechanism. A schema-defined uniqueness promise MUST have a documented concurrency guarantee.

Do not create Payload's broad multi-database adapter contract without a second supported backend. A small query boundary can improve ownership without promising database portability.

**Done when:** each persistence responsibility has an owner, large reads and relation expansion have defined limits, and integrity/concurrency guarantees are verified with representative cases.

### Add-on 5: Stable configuration and extension contracts

**Goal:** make plugin behavior and runtime configuration predictable while allowing internals to evolve.

Build on the existing schema checks and plugin/default assembly. Define one resolved runtime configuration, separate it from the admin's serialized schema and public inference types, and state what may change after initialization.

Document merge order, reserved names, hook ordering, error propagation, and the lifecycle of extensions. Preserve validation rules that depend on actual document data. Avoid a generic plugin framework beyond the existing collection/global/hook/route capabilities.

**Done when:** runtime behavior, admin metadata, and public types describe the same effective configuration, and a third-party plugin can rely on a small documented contract without importing core internals.
