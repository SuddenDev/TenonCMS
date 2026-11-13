# tenoncms core

A feature-first modular monolith. Each module owns a capability; collections and globals share the content engine. Hono adapts HTTP requests to the scoped local API. Public package imports remain defined by the root barrel and package export map.

| Module          | Responsibility                                                    | Start here                                  |
| --------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `cms/`          | Instance construction, configuration and API binding.             | [create-cms.ts](cms/create-cms.ts)          |
| `collections/`  | Collection config, document operations and endpoints.             | [README](collections/README.md)             |
| `globals/`      | Global config, singleton operations and endpoints.                | [README](globals/README.md)                 |
| `content/`      | Shared lifecycle, reads/writes, population and integrity.         | [README](content/README.md)                 |
| `auth/`         | better-auth provider, caller lookup and session middleware.       | [README](auth/README.md)                    |
| `email/`        | Server-side delivery, adapters and authentication templates.      | [README](email/README.md)                   |
| `users/`        | Roles, invites, their operations and endpoints.                   | [README](users/README.md)                   |
| `api-keys/`     | API key management: operations and endpoints.                     | [README](api-keys/README.md)                |
| `locks/`        | Edit locks for the admin: claim, renew, take over, free.          | [README](locks/README.md)                   |
| `versions/`     | Version history: list, read and restore past versions.            | [README](versions/README.md)                |
| `jobs/`         | Tasks, the job queue, `cms.jobs.run()` and the `/jobs` routes.    | [README](jobs/README.md)                    |
| `transfer/`     | `cms.export()` / `cms.import()`: the ZIP archive and its routes.  | [README](transfer/README.md)                |
| `lifecycle/`    | `seed`, `onInit`, `afterImport` and `afterError`.                 | [README](lifecycle/README.md)               |
| `schedule/`     | Scheduled publish and unpublish, the `tenon:` tasks.              | [README](schedule/README.md)                |
| `webhooks/`     | Outgoing webhooks: matching, the `tenon:webhook` task, signing.   | [README](webhooks/README.md)                |
| `http/`         | Hono application assembly, parsing and errors.                    | [app.ts](http/app.ts)                       |
| `access/`       | Access rules: decisions, field stripping, `/schema` permissions.  | [README](access/README.md)                  |
| `schema/`       | Field/hook contracts, inference, validation and traversal.        | [README](schema/README.md)                  |
| `db/`           | Connection, fixed migrations and named content queries.           | [README](db/README.md)                      |
| `richtext/`     | Rich-text config, runtime, reads and writes.                      | [README](richtext/README.md)                |
| `links/`        | Shared link rules for rich text and `link` fields, and endpoints. | [README](links/README.md)                   |
| `media/`        | Uploads, library actions, images, variants and storage.           | [README](media/README.md)                   |
| `preview/`      | Preview URL resolution and browser draft/DOM runtime.             | [README](preview/README.md)                 |
| `client/`       | Browser-safe typed HTTP client.                                   | [create-client.ts](client/create-client.ts) |
| `plugins/`      | Extension contracts, schema merging and named route mounting.     | [README](plugins/README.md)                 |
| `presets/`      | Ready-made fields, hooks and settings.                            | [README](presets/README.md)                 |
| `helpers/`      | Import-free render helpers.                                       | [README](helpers/README.md)                 |
| `seo/`          | `/sitemap.xml`, `/robots.txt` and `cms.sitemap()`.                | [README](seo/README.md)                     |
| `admin/`        | Page/build glue and public UI extension contracts.                | [README](admin/README.md)                   |
| `integrations/` | Framework adapters, Vue components and preview helpers.           | [README](integrations/README.md)            |
| `cli/`          | The `tenon` bin: backup, restore, upgrade, login.                 | [README](cli/README.md)                     |
| `tests/`        | Behavior tests against a real in-memory CMS.                      | [README](tests/README.md)                   |

`index.ts` lists the public root exports. `errors.ts` remains import-free for browser consumers. Internal implementations import their owning leaf modules. Feature definitions belong to `config/`; Hono routes to `endpoints/`; use cases to `operations/`; scoped collection/global methods to `operations/local/`.

Use role suffixes for repeated action names, such as `create.endpoint.ts`, `create.operation.ts` and `create.local.ts`. A file has one main responsibility, usually one or two exported functions; its related private helpers can remain beside it. Module READMEs describe the internal folders.

```text
HTTP request -> feature endpoint -> scoped local API -> feature operation
Server call ---------------------> scoped local API -------^
Nested hook ---------------------> transaction-bound API --^
                                      |
                               shared content engine
                                      |
                              named database queries
```

The local API validates writes and runs hooks for every entry point. HTTP adds session/CSRF checks, request parsing and public field filtering. Local server calls retain their trusted access. Nested hook calls share user, context, transaction and perspective.

## Create a collection document

For `POST /_tenon/collections/posts`, follow:

1. [http/app.ts](http/app.ts) mounts the collection write group after CSRF and the optional session middleware.
2. [collections/endpoints/create.endpoint.ts](collections/endpoints/create.endpoint.ts) checks the target, parses the body and calls the session-bound `cms.create()`.
3. [cms/api/create-local-api.ts](cms/api/create-local-api.ts) assembles methods. [create.local.ts](collections/operations/local/create.local.ts) binds the scope and checks the name, media restriction and draft eligibility.
4. [create.operation.ts](collections/operations/create.operation.ts) provides operation arguments to [run-operation.ts](content/lifecycle/run-operation.ts), which runs operation hooks and delegates the transaction lifetime to [transaction.ts](cms/runtime/transaction.ts).
5. [write-document.ts](content/writes/write-document.ts) checks the `create` rule ([access/rule.ts](access/rule.ts)), drops fields the caller MAY NOT write, selects its write mode and source. [prepare-data.ts](content/writes/prepare-data.ts) owns defaults, slugs, validation and before hooks; [persist-document.ts](content/writes/persist-document.ts) owns integrity, after hooks and [insert-document.query.ts](db/queries/documents/insert-document.query.ts). It returns through read hooks and operation hooks before commit.

Draft create uses the other route in the same endpoint file and the same operation with `draft: true`. It keeps its existing type-only validation and pending-data behavior. A trusted `cms.create()` starts at step 3 and skips the rules.

## Read a global

For `GET /_tenon/globals/general`, follow:

1. [globals/endpoints/get.endpoint.ts](globals/endpoints/get.endpoint.ts) validates the name and read options and calls `c.var.cms`, which `optionalSession()` in [session.middleware.ts](auth/middleware/session.middleware.ts) scopes to the caller; drafts require a session plus the preview cookie.
2. [get.local.ts](globals/operations/local/get.local.ts) checks the name. [get.operation.ts](globals/operations/get.operation.ts) enters the shared lifecycle without opening a read transaction.
3. [read-global.ts](content/reads/read-global.ts) uses [access/read.ts](access/read.ts) for admission and loads the appropriate perspective using [load-global.query.ts](db/queries/globals/load-global.query.ts).
4. [read-results.ts](content/reads/read-results.ts) runs read hooks, batched population and selection. Embedded rich-text links and images resolve through [resolve-richtext.ts](richtext/reads/resolve-richtext.ts), `link` fields through [resolve-links.ts](links/reads/resolve-links.ts); both load targets with [resolve-targets.ts](links/reads/resolve-targets.ts). `afterRead()` removes the fields the caller MAY NOT read ([access/field-access.ts](access/field-access.ts)).

Globals retain their own lifecycle: they skip collection `beforeOperation` and `afterOperation`. A never-saved global returns publication metadata with no saved field values.

With `?locale=de`, `readOptions()` in [read-options.ts](http/query/read-options.ts) passes it on, `withLocale()` in [locale.ts](content/locale.ts) validates it and puts it on the scope and `locOf()` in [loc-of.ts](content/reads/loc-of.ts) turns it into the `Loc` that the queries use. The queries join the locale rows, and [merge-locale.ts](content/reads/merge-locale.ts) merges shared and localized fields.

## Complete an upload

For `POST /_tenon/media/uploads/:id/complete`, follow:

1. [media/endpoints/uploads.endpoint.ts](media/endpoints/uploads.endpoint.ts) runs in the protected media group. `findUpload()` in [upload-row.ts](media/operations/uploads/upload-row.ts) rejects unknown, expired or foreign uploads.
2. [complete.operation.ts](media/operations/uploads/complete.operation.ts) enters the transaction lifetime, registers rollback cleanup, assembles the stored parts and verifies the expected byte count and image header.
3. [cms/runtime/transaction.ts](cms/runtime/transaction.ts) binds the transaction scope. Completion calls the shared content writer, runs media `afterUpload` hooks and deletes the unfinished upload row in that transaction.
4. After the actual outer commit, [render-variants.ts](media/variants/render-variants.ts) prerenders configured variants and [read-media.ts](media/runtime/read-media.ts) decorates the result.

Rollback runs storage abort and file/row cleanup through a live connection. Upload-table queries still live in media; moving them under a persistence contract is a separate architectural add-on. A local `cms.media.upload()` enters through [upload.operation.ts](media/operations/uploads/upload.operation.ts) and uses the same stages.

## Resolve a preview URL

For `POST /_tenon/collections/posts/preview-url`, follow:

1. [collections/endpoints/preview-url.endpoint.ts](collections/endpoints/preview-url.endpoint.ts) checks the configured target and passes unsaved form state plus the session-bound API to the resolver. Globals have their corresponding feature endpoint.
2. [preview/server/resolve-url.ts](preview/server/resolve-url.ts) clones the form state, calls the configured `preview` (else `permalink`) function, or resolves template fields. A relation placeholder loads one target hop through the local `findById()` with `populate: false`. With `?locale=`, the function gets the locale and, with `routing`, a `permalink` result gets the locale prefix.
3. [placeholders.ts](preview/templates/placeholders.ts) identifies template paths, and [resolve-template.ts](preview/templates/resolve-template.ts) `resolveTemplate()` returns the filled URL or `null` for missing values.

There is no extra public local preview method. The browser entry [preview/index.ts](preview/index.ts) exports DOM/draft runtime helpers and does not import the server URL resolver.
