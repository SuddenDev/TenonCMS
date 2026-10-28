# Drafts

Every document and global has a published version and MAY have a pending draft. Reads return two extra fields: `publishedAt` (`null` if never published) and `hasDraft`.

## Perspectives

Reads run in one of two perspectives:

- **published** (the default): only published documents, with their published data.
- **drafts**: every document, with its draft where one is pending. Filters, relations and joins use the draft data too.

```ts
await cms.find("posts"); // published
await cms.withDrafts().find("posts"); // drafts
```

Server-rendered pages get the visitor's perspective with `withSession()`. It returns the instance bound to the session user. It uses the drafts perspective only when the request carries the preview cookie set to `drafts` and a valid session:

```ts
const integral = await cms.withSession(request);
const posts = await integral.find("posts");
```

- Astro: the middleware does this, so `Astro.locals.integral` is already bound to the request.
- Nuxt: `useIntegral()` reads over HTTP with the request's cookies, so the HTTP rules below apply.
- TanStack Start: call it in server functions with `getRequest()` from `@tanstack/react-start/server`.

## Saving, publishing and discarding

Writes publish by default. A draft save keeps the published data and stores the change as the pending draft:

```ts
const post = await cms.create("posts", { title: "Soon" }, { draft: true }); // never published
await cms.update("posts", post.id, { body: "..." }, { draft: true });
await cms.publish("posts", post.id); // validates, then publishes the draft
await cms.discard("posts", post.id); // drops the draft; a never-published document is deleted
await cms.setGlobal("general", { title: "New" }, { draft: true });
await cms.publishGlobal("general");
await cms.discardGlobal("general");
```

- A draft save runs defaults, slugs, `beforeValidate` and `beforeChange`, and checks types only. `required`, `pattern`, `min`, `max`, `validate`, `unique` and relation ids wait for the publish.
- `afterChange` runs only on publish.
- A publish runs every check and hook of an update on the draft. If one fails, it throws a `ValidationError` and the draft stays.
- Hooks see `draft: true` on a draft save and `false` otherwise.

`drafts: false` on a collection or global turns this off. Then `{ draft: true }` and `discard` throw a `ValidationError`. The media library has no drafts.

## Edit conflicts

A save, draft save or publish MAY send the `updatedAt` it loaded. If someone saved since, the write throws a `ConflictError` (HTTP 409) and changes nothing. Without `updatedAt` the last write wins.

```ts
const post = await cms.withDrafts().findById("posts", id);
await cms.update("posts", id, { title: "New" }, { draft: true, updatedAt: post.updatedAt });
```

- It works on `update`, `publish`, `setGlobal` and `publishGlobal`. Over HTTP it is the `?updatedAt=` query.
- In a localized entry, `updatedAt` is the later of the shared row and the locale's row. A save in another locale does not conflict, unless it changes shared fields.
- The admin sends it with every save. On a 409 it shows a message and a Reload button. Reload drops your unsaved edits.
- The 409 body has `code: "CHANGED"`. A delete that `restrict` references block also answers 409, without that code.

### Edit locks

The admin lets one person edit a document or global at a time, like Payload and WordPress.

- Opening the form claims the lock. The admin renews it every 30 seconds and frees it when you leave. Without a renewal, a lock expires after 90 seconds (`LOCK_TTL`).
- Others see "Anna is editing this", a read-only form and a **Take over** button. Once the lock is free, their form becomes editable again and loads the latest version.
- A takeover moves the lock at once. The first editor learns it on the next renewal, and their form turns read-only.
- Locks only guide the admin. The API does not enforce them; the `updatedAt` check protects writes.

| Action              | Request                                                                         |
| ------------------- | ------------------------------------------------------------------------------- |
| Claim or renew      | `POST /api/cms/collections/:name/:id/lock`, `{ "takeover": true }` to take over |
| Free                | `DELETE /api/cms/collections/:name/:id/lock`                                    |
| Global: claim, free | `POST`, `DELETE` on `/api/cms/globals/:name/lock`                               |

A claim answers `{ mine, user: { id, name } }`: whether you hold the lock, and who does. It needs a session and the right to update; API keys cannot lock. The client has `lock`, `unlock`, `lockGlobal` and `unlockGlobal`.

### Version history

Every document and global keeps its past versions, per language. In the admin, open **…** → **History**. The list is grouped by time (today, yesterday, this week, this month, last month, older). An opened version marks the fields it changed against the version before it.

- A publish, and every save without drafts, adds a **Published** version.
- Draft saves add an **Edited** version. A user's autosaves update that one version until someone else saves, it is published, or 30 minutes pass without a save. So typing does not add a version per keystroke, and a later editing session gets its own version.
- Each version names its user. Server code records none.
- **Restore** writes a version back as the draft of its language, through the normal write: access rules, hooks and validation apply. Publish it to go live. Without drafts, restore saves it at once.
- Each document keeps its newest 100 versions per language; recording one more deletes the oldest. Set `maxVersions` on the collection or global to change it, or `Infinity` to keep every version. Deleting a document deletes its versions.
- The history needs a session and the right to update. A version leaves out the fields you MAY NOT read.

| Action           | Request                                                         |
| ---------------- | --------------------------------------------------------------- |
| List             | `GET /api/cms/collections/:name/:id/versions?locale=de`         |
| Read one         | `GET /api/cms/collections/:name/:id/versions/:version`          |
| Restore          | `POST /api/cms/collections/:name/:id/versions/:version/restore` |
| Global: the same | on `/api/cms/globals/:name/versions`                            |

A list entry is `{ id, status, locale, user, createdAt, updatedAt }`; reading one adds `data`. The client has `versions`, `version`, `restoreVersion`, `globalVersions`, `globalVersion` and `restoreGlobalVersion`.

## Over HTTP

With a session:

| Action                         | Request                                                                  |
| ------------------------------ | ------------------------------------------------------------------------ |
| Create a draft                 | `POST /api/cms/collections/:name/draft`                                  |
| Save a draft                   | `PUT /api/cms/collections/:name/:id/draft`                               |
| Publish                        | `POST /api/cms/collections/:name/:id/publish`                            |
| Discard (204 when deleted)     | `DELETE /api/cms/collections/:name/:id/draft`                            |
| Global: save, publish, discard | `PUT`, `POST`, `DELETE` on `/api/cms/globals/:name/draft` and `/publish` |

The client has `createDraft`, `updateDraft`, `publish`, `discard`, `setGlobalDraft`, `publishGlobal` and `discardGlobal`.

## The preview cookie

The cookie `integral-preview` holds the perspective: `drafts` or `published`.

- `POST /api/cms/preview` sets it. The body is optional: `{ "perspective": "published" }` (default `drafts`). `DELETE /api/cms/preview` clears it. Both need a session.
- It is not `HttpOnly`, so the preview runtime can read it.
- In the browser, call `client.preview.enter(perspective?)` and `client.preview.exit()`.
- HTTP reads show drafts only with `integral-preview=drafts` **and** a session, so the cookie alone shows nothing.
