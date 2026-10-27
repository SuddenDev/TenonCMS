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
