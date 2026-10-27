# Framework integrations

Code: `packages/core/src/integrations/` (see its README). User docs: [framework setup](../guide/frameworks.md).

## Shared approach

- Adapters generate almost no code: only type declarations, the admin page HTML and the client registry module. They alias `#integral/config` to the host's `integral.config.ts` and mount runtime files that ship as TypeScript source. The host's bundler compiles them.
- They register the API route at `/api/cms/**`. The admin page is a second client entry built from the same admin library, with a virtual client registry for the host's `clientRef()` modules.
- The admin path is an **adapter option** (default `/admin`), not part of the config, because routes are registered at build time before the config can load.
- Core must stay external in server builds. libsql loads a native binary with a dynamic require, which a bundler breaks. In dev it stays internal so Vite reloads it.
- Types are added by augmenting the app's types with the config type, so the client and `Astro.locals` are typed.

## Astro

- Injects the API route, the admin route and a middleware that puts a session-bound `cms` on `locals`. That is why the admin preview renders drafts. Prerendered pages get the plain instance.
- Starts the preview runtime on every page unless turned off, with `morph` on so server-rendered pages refresh after a save. Locale and path (without the locale prefix) are also set on `locals`.
- Astro's static routes match unprefixed URLs only, so with locale routing every other route needs a prefixed variant.

## Nuxt

- A module with a Nitro handler for the API, an admin page served from a Nitro virtual module, a client plugin for the preview runtime and auto-imported composables.
- `useIntegral()` wraps `useAsyncData` around the client. During SSR the client fetches in-process and forwards the request's headers, so drafts work. It merges preview drafts into results, and reads in the route's locale.
- Server runtime files MUST import from `h3`, not `#imports`, or the app's typecheck cannot resolve them.

## Vite hosts (TanStack Start, standalone)

- `integralAdmin()` is a Vite plugin for frameworks without an adapter. It marks core external for builds, adds the admin entry and serves the admin page HTML. In dev it goes through the dev server so framework preambles apply; in a build it comes from the client bundle.
- The host adds a catch-all server route for `/api/cms` and a route that returns the admin HTML.
- TanStack Start allows only one client entry, so the plugin must mark the admin chunk as a non-entry before Start reads it.
