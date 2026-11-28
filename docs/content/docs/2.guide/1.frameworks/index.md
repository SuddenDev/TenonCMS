---
title: Overview
description: How Tenon connects to a framework, and which guide to follow.
---

Tenon runs inside your app, so your framework serves the CMS next to your pages. This section shows the setup for each framework.

## What every setup does

Every setup does three things:

1. It sends every request under `/_tenon/*` to the CMS: the HTTP API, media files and sign-in. `/sitemap.xml` and `/robots.txt` go there too.
2. It serves the admin page at `/admin`, or at the path you set in `admin.path`.
3. It gives your pages the CMS instance from `tenon.config.ts`.

Astro has an integration and Nuxt a module that do all three. TanStack Start and other Vite apps add `tenonAdmin()` to the Vite config and write a few route files. Without Vite, you write the routes and mount the admin yourself.

The Astro integration, the Nuxt module and `tenonAdmin()` also run due [jobs](/docs/core/operations/jobs) every minute, on most hosts. See [The clock](/docs/core/operations/jobs/clock).

## Pick your framework

::card-group
:::card{title="Astro" icon="i-simple-icons-astro" to="/docs/guide/frameworks/astro"}
The `tenoncms/astro` integration and a typed `Astro.locals.tenon`.
:::

:::card{title="Nuxt" icon="i-simple-icons-nuxt" to="/docs/guide/frameworks/nuxt"}
The `tenoncms/nuxt` module, `useTenon()` and auto-imported components.
:::

:::card{title="TanStack Start" icon="i-simple-icons-tanstack" to="/docs/guide/frameworks/tanstack-start"}
`tenonAdmin()`, four route files and server functions.
:::

:::card{title="Standalone" icon="i-lucide-server" to="/docs/guide/frameworks/standalone"}
Only the API and the admin, for frontends that read over HTTP.
:::

:::card{title="Other frameworks" icon="i-lucide-boxes" to="/docs/guide/frameworks/other-frameworks"}
Any server that speaks `Request` and `Response`.
:::
::

## What works where

| Framework      | Setup                          | Node | Vercel | Cloudflare | Components                                |
| -------------- | ------------------------------ | ---- | ------ | ---------- | ----------------------------------------- |
| Astro          | `tenoncms/astro` integration   | yes  | yes    | yes        | `tenoncms/astro/components`               |
| Nuxt           | `tenoncms/nuxt` module         | yes  | yes    | –          | `tenoncms/vue`, auto-imported as `Tenon*` |
| TanStack Start | `tenonAdmin()` and route files | yes  | yes    | –          | `tenoncms/react`                          |
| Standalone     | `tenonAdmin()` and `server.ts` | yes  | yes    | –          | None. Frontends read over HTTP            |

- `npm create tenoncms` offers each framework for the targets marked "yes".
- Other frameworks run where their server runs. They use the components of `tenoncms/vue` or `tenoncms/react`.
- On Cloudflare, the CMS runs in a Durable Object. Only Astro supports that for now. See [Cloudflare](/docs/guide/deployment/cloudflare).
- Each library has the same components, except `Seo`: Vue has none, and Nuxt has `useTenonSeo()`. See [Components](/docs/core/building-your-site/components).

## Related resources

- [Quick Start](/docs/core/getting-started/quick-start): create a project with `npm create tenoncms`.
- [Add to an Existing Site](/docs/core/getting-started/existing-site): add Tenon to an app you already have, step by step.
- [How Tenon works](/docs/core/getting-started/how-tenon-works): the local API, the HTTP API and how Vite fits in.
- [Deployment](/docs/guide/deployment): run the site on Node, Vercel or Cloudflare.
