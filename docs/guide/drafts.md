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
const tenon = await cms.withSession(request);
const posts = await tenon.find("posts");
```

- Astro: the middleware does this, so `Astro.locals.tenon` is already bound to the request.
- Nuxt: `useTenon()` reads over HTTP with the request's cookies, so the HTTP rules below apply.
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

`drafts: false` on a collection or global turns this off. Then `{ draft: true }`, `unpublish`, `schedule` and `discard` throw a `ValidationError`. The media library has no drafts.

## Unpublishing

`unpublish` takes a document off the published perspective. It follows the Sanity model: the live version goes and the content stays editable.

```ts
await cms.unpublish("posts", post.id); // only the drafts perspective reads it now
await cms.unpublishGlobal("general");
await cms.publish("posts", post.id); // puts it live again
```

- A pending draft stays. Without one, the published data becomes the draft, so nothing is lost.
- The result is the document in the drafts perspective: `publishedAt` is `null` and `hasDraft` is `true`.
- Unique values (a slug, for example) stay reserved while the document is unpublished, so a publish does not fail on a name that another document took. In a localized collection, a locale that is not published reserves nothing.
- `afterChange` runs with the published document as `previousDoc`.
- It adds an **Unpublished** version to the history, holding the content that went offline. Restoring it makes that content the draft, like any version.
- It takes the `updatedAt` option like `publish`: a document that changed since you loaded it throws a `ConflictError` (HTTP 409, `?updatedAt=`).
- A document that is not published stays as it is and adds no version. A missing document returns `undefined`.
- In a localized entry, `{ locale }` unpublishes that language only. The document goes with its last published language.
- A discard after an unpublish deletes the document, like any document that was never published. The admin asks before it does.
- In the admin, the Publish button has a chevron menu with **Unpublish**. It shows for a published entry (or language) and asks first.
- It needs the `update` rule. `drafts: false` throws a `ValidationError`.

## Scheduling

`schedule: true` on a collection or global lets editors queue a publish or an unpublish for a later time. It is off by default and needs drafts: `schedule` with `drafts: false` throws at startup.

```ts
defineCms({
  collections: { posts: { schedule: true, fields: { title: { type: "text" } } } },
});

await cms.schedule("posts", post.id, { action: "publish", at: "2027-01-01T09:00:00Z" });
await cms.schedule("posts", post.id, { action: "unpublish", at: new Date("2027-02-01") });
await cms.scheduleGlobal("general", {
  action: "publish",
  at: Date.now() + 3_600_000,
  locale: "de",
});
```

Both return `{ id }`, the id of the [job](./jobs.md#built-in-tasks) that does the work.

- A scheduled publish **locks the draft** of its language until it runs or you cancel it, so it publishes what you scheduled. An unpublish works like [`unpublish`](#unpublishing).
- It needs a clock like any [job](./jobs.md#run-the-due-jobs). Without one, the job waits. The precision is one minute at best.
- `at` MAY be in the past: the job is due at once and runs on the next tick of the clock. An entry without `schedule` throws a `ValidationError`, like an unknown `action` or `locale`.
- A publish needs a draft in the language: pending changes, or a document or language that was never published. Without one it throws a `ValidationError` (`"Nothing to publish"`). An unpublish needs none.
- While a publish is queued, a draft save, `copyLocale` into that language, a version restore, `discard` and `removeLocale` of that language (or `discard` with `all`) throw a `ValidationError`. Cancel the schedule first. Shared fields edited in another language still go out with the scheduled publish.
- `publishedAt` is the time the job ran, also for a time in the past. It does not backdate.
- A document that does not exist returns `undefined` and queues nothing. Over HTTP and in the client it answers 404. A draft-only document exists and MAY be scheduled.
- In a localized entry, `{ locale }` schedules that language only. Each locale has its own job.
- A document has at most one scheduled publish and one scheduled unpublish per language. A new schedule for the same action and language replaces the queued one.
- It needs the `update` rule **when you schedule**. The job runs as the server, so the rule is not checked again and `updatedBy` is `null` on the result. Remove access later and the job still runs; cancel it first.
- A document that is deleted after you scheduled it ends the job as `"missing"`. It counts as done and is not retried.
- A publish that fails validation fails the job. The job retries three times with a backoff, then stays `failed` in `/_tenon/jobs` until someone retries or cancels it.
- In the admin, an entry with `schedule: true` has **Schedule…** in the chevron menu of the Publish button. The dialog takes the action (publish or unpublish), a date and time in your time zone, and the languages of a localized entry (one job each). For a publish, a language without a draft cannot be selected. A time in the past asks for confirmation, then runs right away. It lists the upcoming schedules of the document, and each can be cancelled. A small clock sits next to the draft and published status, in the document and in the list. Hovering it shows when each schedule runs. Languages released at the same time share one line.
- Once the active language has a scheduled publish, the Publish button turns into **Publishing scheduled**. It opens the dialog instead of publishing. There you can change the time (**Update schedule**), **Delete schedule**, or **Publish now**, which publishes and deletes the schedule. The fields and **Discard changes** are locked until the schedule is deleted. A notice above the form says who scheduled it and when, and opens the dialog. The dialog names who scheduled each job.
- List the scheduled jobs of a document with `GET /_tenon/jobs?status=queued&target=collection:posts&docId=<id>` (`target=global:<name>&docId=` for a global). Everyone who MAY update the document sees them and MAY cancel them with `DELETE /_tenon/jobs/:id`.

## Edit conflicts

A save, draft save or publish MAY send the `updatedAt` it loaded. If someone saved since, the write throws a `ConflictError` (HTTP 409) and changes nothing. Without `updatedAt` the last write wins.

```ts
const post = await cms.withDrafts().findById("posts", id);
await cms.update("posts", id, { title: "New" }, { draft: true, updatedAt: post.updatedAt });
```

- It works on `update`, `publish`, `unpublish`, `setGlobal`, `publishGlobal` and `unpublishGlobal`. Over HTTP it is the `?updatedAt=` query.
- In a localized entry, `updatedAt` is the later of the shared row and the locale's row. A save in another locale does not conflict, unless it changes shared fields.
- The admin sends it with every save. On a 409 it shows a message and a Reload button. Reload drops your unsaved edits.
- The 409 body has `code: "CHANGED"`. A delete that `restrict` references block also answers 409, without that code.

### Edit locks

The admin lets one person edit a document or global at a time, like Payload and WordPress.

- Opening the form claims the lock. The admin renews it every 30 seconds and frees it when you leave. Without a renewal, a lock expires after 90 seconds (`LOCK_TTL`).
- Others see "Anna is editing this", a read-only form and a **Take over** button. Once the lock is free, their form becomes editable again and loads the latest version.
- A takeover moves the lock at once. The first editor learns it on the next renewal, and their form turns read-only.
- Locks only guide the admin. The API does not enforce them; the `updatedAt` check protects writes.

| Action              | Request                                                                        |
| ------------------- | ------------------------------------------------------------------------------ |
| Claim or renew      | `POST /_tenon/collections/:name/:id/lock`, `{ "takeover": true }` to take over |
| Free                | `DELETE /_tenon/collections/:name/:id/lock`                                    |
| Global: claim, free | `POST`, `DELETE` on `/_tenon/globals/:name/lock`                               |

A claim answers `{ mine, user: { id, name } }`: whether you hold the lock, and who does. It needs a session and the right to update; API keys cannot lock. The client has `lock`, `unlock`, `lockGlobal` and `unlockGlobal`.

### Version history

Every document and global keeps its past versions, per language. In the admin, open **…** → **History**. The list is grouped by time (today, yesterday, this week, this month, last month, older). An opened version marks the fields it changed against the version before it.

- A publish, and every save without drafts, adds a **Published** version. An unpublish adds an **Unpublished** version with the content that went offline.
- Draft saves add an **Edited** version. A user's autosaves update that one version until someone else saves, it is published, or 30 minutes pass without a save. So typing does not add a version per keystroke, and a later editing session gets its own version.
- Each version names its user. Server code records none.
- **Restore** writes a version back as the draft of its language, through the normal write: access rules, hooks and validation apply. Publish it to go live. Without drafts, restore saves it at once.
- Each document keeps its newest 100 versions per language; recording one more deletes the oldest. Set `maxVersions` on the collection or global to change it, or `Infinity` to keep every version. Deleting a document deletes its versions.
- The history needs a session and the right to update. A version leaves out the fields you MAY NOT read.

| Action           | Request                                                        |
| ---------------- | -------------------------------------------------------------- |
| List             | `GET /_tenon/collections/:name/:id/versions?locale=de`         |
| Read one         | `GET /_tenon/collections/:name/:id/versions/:version`          |
| Restore          | `POST /_tenon/collections/:name/:id/versions/:version/restore` |
| Global: the same | on `/_tenon/globals/:name/versions`                            |

A list entry is `{ id, status, locale, user, createdAt, updatedAt }`; reading one adds `data`. The client has `versions`, `version`, `restoreVersion`, `globalVersions`, `globalVersion` and `restoreGlobalVersion`.

## Over HTTP

With a session:

| Action                                    | Request                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| Create a draft                            | `POST /_tenon/collections/:name/draft`                                               |
| Save a draft                              | `PUT /_tenon/collections/:name/:id/draft`                                            |
| Publish                                   | `POST /_tenon/collections/:name/:id/publish`                                         |
| Unpublish                                 | `POST /_tenon/collections/:name/:id/unpublish`                                       |
| Discard (204 when deleted)                | `DELETE /_tenon/collections/:name/:id/draft`                                         |
| Global: save, publish, discard            | `PUT`, `POST`, `DELETE` on `/_tenon/globals/:name/draft` and `/publish`              |
| Global: unpublish                         | `POST /_tenon/globals/:name/unpublish`                                               |
| Schedule (body `{ action, at, locale? }`) | `POST /_tenon/collections/:name/:id/schedule`, `POST /_tenon/globals/:name/schedule` |

The client has `createDraft`, `updateDraft`, `publish`, `unpublish`, `discard`, `setGlobalDraft`, `publishGlobal`, `unpublishGlobal` and `discardGlobal`. `schedule` and `scheduleGlobal` take `{ action, at, locale? }`.

## The preview cookie

The cookie `tenon-preview` holds the perspective: `drafts` or `published`.

- `POST /_tenon/preview` sets it. The body is optional: `{ "perspective": "published" }` (default `drafts`). `DELETE /_tenon/preview` clears it. Both need a session.
- It is not `HttpOnly`, so the preview runtime can read it.
- In the browser, call `client.preview.enter(perspective?)` and `client.preview.exit()`.
- HTTP reads show drafts only with `tenon-preview=drafts` **and** a session, so the cookie alone shows nothing.
