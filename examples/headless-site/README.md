# Headless site

Tenon usually runs inside your site, on the same origin. This example splits the two. The CMS runs on its own origin, and the site reads its content over HTTP.

- The CMS is [`examples/standalone`](../standalone), on port 3200.
- The site is this Astro app, on port 4324. It does not use the `tenoncms/astro` integration. It imports only `tenoncms/client`, `tenoncms/preview` and `tenoncms/components`.

It shows:

- server-rendered pages that read through `createRequestClient()`,
- drafts for a signed-in editor, published content for everyone else,
- the admin bar on the site, with its Drafts / Published switch,
- live preview in the admin's visual editor,
- images served by the CMS, with absolute URLs.

## Run it

From the repository root:

```sh
cp -n examples/standalone/.env.example examples/standalone/.env
pnpm dev:headless
```

Copy the environment file only on the first run. Its sample secret works locally. The site needs no `.env`: `TENON_CMS_URL` defaults to `http://localhost:3200`.

`dev:headless` builds the packages, then starts the CMS, the site, the package watchers and the admin playground. It gives the CMS `TENON_SITE_URL=http://localhost:4324` and `TENON_CMS_URL=http://localhost:3200`.

1. Open <http://localhost:3200/admin> and create the first admin.
2. Create a post, add a hero image and publish it.
3. Open <http://localhost:4324>. You are signed in, so the admin bar shows at the bottom.
4. Switch the bar to Drafts or Published. The page reloads with that version.
5. Click Edit in the bar. The admin opens the page in its visual editor. Switch the form to the draft and type: the page follows as you type.

## The CMS side

[`examples/standalone/tenon.config.ts`](../standalone/tenon.config.ts) reads both origins from the environment:

```ts
defineCms({
  site: { url: process.env.TENON_SITE_URL },
  auth: { baseURL: process.env.TENON_CMS_URL },
});
```

- `site.url` is the public site. CORS allows its origin. Relative preview URLs open on it.
- `auth.baseURL` is the CMS origin. Sign-in and links into the admin use it.
- A headless CMS MUST set both. With only `site.url`, auth uses the site's origin. Sign-in in the admin then fails with `INVALID_ORIGIN`, and media URLs stay relative.
- A project from `create-tenoncms --framework standalone` reads both variables already.
- With both set to different origins, media URLs come back absolute on the CMS: `http://localhost:3200/_tenon/media/...`. URLs that are already absolute, like those of a hosted image provider, stay as they are.
- While `TENON_SITE_URL` is set, posts get `permalink: "/posts/{slug}"`, so the admin's preview opens them on the site. Pages get no permalink, because this site does not render them. Without `TENON_SITE_URL`, the CMS runs alone as before.

On real domains, the site and the CMS are two hosts of one parent domain, like `www.example.com` and `cms.example.com`. Put the cookies on the parent domain:

```ts
defineCms({
  site: { url: "https://www.example.com" },
  auth: {
    baseURL: "https://cms.example.com",
    advanced: { crossSubDomainCookies: { enabled: true, domain: "example.com" } },
  },
});
```

The session cookie, the `tenon-session` hint and the `tenon-preview` cookie then live on `example.com`. The browser sends them to the site too, and the site's page code can read the hint and the preview cookie. Set `domain` yourself: without it, the cookies stay on the CMS host. Two localhost ports need none of this, because cookies ignore ports.

To allow more origins, like a staging site, set `cors`. It takes the options of [Hono's `cors()`](https://hono.dev/docs/middleware/builtin/cors) and replaces the defaults key by key. An `origin` replaces `site.url`, so list the site too:

```ts
defineCms({
  cors: { origin: ["https://www.example.com", "https://staging.example.com"] },
});
```

## The site side

[`src/lib/cms.ts`](src/lib/cms.ts) builds one client per page request:

```ts
createRequestClient<typeof cms>(request, { baseUrl: TENON_CMS_URL });
```

It sends the request's `cookie` header to the CMS, and to no other origin. Create a new one for every request. A shared client would read one visitor's content as another.

[`src/components/Layout.astro`](src/components/Layout.astro) starts the preview runtime on every page:

```ts
preview({ admin: `${TENON_CMS_URL}/admin`, morph: true });
```

- `admin` is the full URL of the admin. The live preview trusts only its origin. The admin bar calls the CMS API on that origin, with the CMS's cookies. If the CMS changes `admin.path`, change it here too.
- `morph: true` renders the page again from the server after a draft save, so content that is not marked updates too.

The pages mark what a field renders with `edit()`:

```astro
<h1 data-cms={edit("posts", post.id, "title")}>{post.title}</h1>
```

The visual editor lists the documents a page marks under "On this page", and the live preview writes the unsaved value into the marked elements.

[`src/pages/posts/[slug].astro`](src/pages/posts/[slug].astro) renders the hero image with `imageAttrs()`. It returns `src`, `width`, `height`, `alt` and lazy loading, plus `srcset` when the CMS makes image variants. With a `data-cms` attribute it also adds `data-cms-attr="src,srcset,alt"`, so the live preview swaps the image.

`TENON_CMS_URL` is a public variable of [`astro:env`](https://docs.astro.build/en/guides/environment-variables/). The server reads content from it, and the browser loads the admin bar from it. A build writes its value into the code, so set it before you build. Give the origin only, without a path or a trailing slash.

## How drafts reach a server render

1. The editor signs in at the CMS. The browser keeps the session cookie for the CMS host, or for the parent domain.
2. The Drafts / Published switch, or the admin's visual editor, sets the `tenon-preview` cookie.
3. The browser sends both cookies with every page request to the site.
4. `createRequestClient()` forwards them to the CMS.
5. The CMS returns drafts only for a valid session with `tenon-preview=drafts`. A request without a session reads published content, even with the preview cookie.

A statically built site has no page request, so its build reads published content. Rebuild it when content changes, for example with a deploy hook as a [webhook](../../docs/guide/webhooks.md).

## Types

In a monorepo, import the CMS config as a type only, like [`src/lib/cms.ts`](src/lib/cms.ts):

```ts
import type cms from "../../../standalone/tenon.config";
```

`createRequestClient<typeof cms>()` then knows the collections and their fields. A type-only import puts no CMS code in the site's bundle.

When the site and the CMS live in separate repositories, there is no type generation yet. Without a type argument, the client takes any collection name and returns loosely typed documents.

## Production checklist

- Serve the site and the CMS from the same parent domain, like `www.example.com` and `cms.example.com`.
- Set `site.url` to the site and `auth.baseURL` to the CMS.
- Set `crossSubDomainCookies` with `domain` set to the parent domain.
- Serve both over HTTPS. With an `https` `auth.baseURL`, the session cookie is `Secure`. The browser then sends it only to HTTPS pages.
- Build the site with `TENON_CMS_URL` set to the CMS origin.

> [!WARNING]
> The shared session cookie is the editor's full session. The site's server, and every other host under the parent domain, receives it and can act as the signed-in editor. Page code on an allowed origin can read and write content as that editor. Share the cookie only when you control every host under that domain and the code on the allowed origins.

## Limits

- The site and the CMS MUST share a parent domain, or be two localhost ports. Unrelated domains do not work: there is no token flow.
- Admin bar items with browser code (`clientRef()`, like `onClick` or `mount`) are skipped on a site without a Tenon adapter. Links and menus still show.
- CORS covers only the admin bar and the content routes, with `GET` and `POST` by default. Auth, users, API keys and invites stay closed to the site. Page code cannot send `PUT` or `DELETE` to the CMS unless `cors.allowMethods` lists them.
- Through the request client, a write without a JSON body answers 403: `publish()`, `delete()` and `media.upload()`. The CMS's CSRF check wants an `Origin`, and a server sends none. Use a client with an `apiKey` for those. JSON writes, like `create()` and `update()`, work.
- A `createClient()` in the site's browser code reads published content. Its requests carry no cookies to the CMS, unless you pass your own `fetch` with `credentials: "include"`.
