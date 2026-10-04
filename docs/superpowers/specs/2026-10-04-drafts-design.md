# Drafts, autosave and publish

Every edit in the admin is saved as a draft while typing. Publish makes it the live version. A
preview cookie lets the site render drafts for signed-in editors, which also gives Astro pages the
re-render path of the live preview (`2026-10-04-live-preview-design.md`).

## Storage

Migration `004_cms_drafts` adds to `cms_documents` and `cms_globals`:

- `draft text` (nullable): the pending version, or `NULL` when nothing is pending.
- `published_at integer` (nullable): `NULL` for a document that was never published. Backfilled
  with `updated_at` for existing rows, because everything so far was published on save.

`data` stays `NOT NULL`: a never-published document stores `'{}'` there. One row per document, so
ids, relations, joins, `onDelete`, unique checks and the media index stay as they are.

Derived status, no column: never published (`published_at IS NULL`), published (`draft IS NULL`),
published with changes (both set).

## Perspective

A read runs in one of two perspectives:

- **published** (default): rows `WHERE published_at IS NOT NULL`, data from `data`.
- **drafts**: every row, data from `COALESCE(draft, data)`. Filters, `byIds()`, `joinedDocs()`,
  `loadDoc()` and `loadGlobal()` use the same expression.

`Scope` gets `drafts: boolean`. `documents.ts` functions take it. Read options do not carry it: the
perspective is a property of the caller, like `user`.

- Local API: `cms.drafts()` returns the same API with `drafts: true` (like `asUser`).
- HTTP: a read uses the drafts perspective when the request carries the `integral-preview` cookie
  **and** a valid session (`readLevel()` already looks the session up; the cookie alone grants
  nothing).
- `cms.forRequest(request)` returns the API bound to the request's session user and perspective.
  The Astro middleware sets `locals.integral = await cms.forRequest(request)` (one session lookup,
  only when a cookie is present). The TanStack example uses it in its server functions. Nuxt pages
  fetch through `event.fetch`, so the HTTP rule covers them.
- `POST /api/cms/preview` (session-gated, under `writes`) sets `integral-preview=1` (`HttpOnly`,
  `SameSite=Lax`, `Path=/`) and answers 204; `DELETE /api/cms/preview` clears it. The admin calls
  the first after login (`useSession()`), so its own reads and every preview it opens see drafts.
  Client: `client.preview.enter()` / `client.preview.exit()`.

Reverse scans for `onDelete` keep reading `data`. A draft that references a deleted document reads
as `null`, like any dangling id.

Document meta grows by `publishedAt: string | null` and `hasDraft: boolean` (collections and
globals, `Doc` and the read types; `strip()` keeps them). Media rows are always published.

## Writes

`Collection` and `Global` get `drafts?: boolean`, default `true`. The `media` collection and
plugin collections that set `drafts: false` write as today. `/schema` sends it.

### Draft save

`cms.create(name, data, { draft: true })`, `cms.update(name, id, data, { draft: true })`,
`cms.setGlobal(name, data, { draft: true })`. Rejected with `ValidationError` when the collection
has `drafts: false`.

The "before" half of the pipeline runs: `applyDefaults()` (create), `fillSlugs()`, field and
collection `beforeValidate`, a loose `parseData()` (shape only: `required`, `pattern`, `min`,
`max`, `unique` and ref existence are skipped), `beforeChange`, then the row: `draft` set,
`updated_at` set, `data` and `published_at` untouched (`'{}'` and `NULL` on create). Then
`afterRead`. No `validate`, no `afterChange`. Hooks get `draft: true` in their args.

The returned document is the draft perspective of the row.

### Publish

`cms.publish(name, id)`, `cms.publishGlobal(name)`. Loads `COALESCE(draft, data)` and runs the full
`write()` pipeline on it as an update (so `validate`, unique, refs and `afterChange` run; hooks get
`draft: false`), then stores the result in `data`, nulls `draft`, sets `published_at`. A
`ValidationError` leaves the draft as it is. Publishing without a draft re-runs the pipeline on
`data` (a no-op publish is allowed).

### Discard

`cms.discard(name, id)`, `cms.discardGlobal(name)`: nulls `draft`. A never-published document is
deleted instead (through `remove()`, so `onDelete` runs).

### Delete

`delete` removes the row, draft included, as today.

### HTTP and client

- `POST /collections/:name/draft` (create as draft), `PUT /collections/:name/:id/draft`,
  `POST /collections/:name/:id/publish`, `DELETE /collections/:name/:id/draft` (discard).
- `PUT /globals/:name/draft`, `POST /globals/:name/publish`, `DELETE /globals/:name/draft`.
- Client: `createDraft`, `updateDraft`, `publish`, `discard`, `setGlobalDraft`, `publishGlobal`,
  `discardGlobal`.

## Admin

- `DocForm.vue` with `drafts` (the default): no Save button. Autosave 800 ms after the last change
  and on blur, one request at a time (a change during a save queues one more). A new document is
  created by its first autosave; the route is replaced with the id. The footer shows "Saving…",
  "Draft saved <ago>", "Published <ago>", or the error. Buttons: "Discard changes" (when
  `hasDraft`; a confirm), "Publish" (primary, disabled while saving or without changes since
  publish). Validation errors from publish mark the fields as today.
- With `drafts: false` the form keeps today's Save button.
- Badges in the document header, like the reference screenshot: "Published" (green dot) when
  `publishedAt`, "Draft" (amber dot) when `hasDraft` or never published.
- `CollectionList.vue` reads with the drafts perspective (the admin always has a session and sets
  the cookie on login through `/api/cms/preview`) and shows the amber dot on items with a draft.
- The preview pane broadcasts `{ type: 'saved', collection, id }` after every autosave.

## Astro re-render

`preview({ morph: true })` (the Astro integration passes it): on `saved`, the runtime fetches
`location.href` (same cookies, so the drafts perspective), parses it and morphs `document.body`
with `idiomorph` (bundled into the preview entry), then re-applies layer A. Prerendered pages fetch
their static HTML and change nothing visible; documented limit.

## Testing

- `src/tests/drafts.test.ts`: draft create keeps the document out of published reads and in drafts
  reads; `COALESCE` filters; draft save skips `required` and `unique` but keeps type checks; hooks
  see `draft: true`; `beforeChange` runs on drafts (the preset `path` fills); `afterChange` only on
  publish; publish validates and leaves the draft on error; discard; discard of an unpublished
  document deletes; `drafts: false` rejects `{ draft: true }`; `publishedAt` / `hasDraft` meta;
  the preview cookie switches HTTP reads only with a session; `forRequest()`.
- `db/index.ts` migration test: the backfill of `published_at`.

## Out of scope

Version history, scheduled publishing, per-field change tracking, roles.
