---
title: Overview
description: What a deployed Tenon site needs, and which guide to follow.
---

Tenon deploys with your site: one build, one server, one deploy. This page lists what that server needs and helps you pick a host.

## What a deployment needs

- **A server runtime.** The admin and the API are server routes, so a purely static host cannot run them. Pages can still be prerendered.
- **A database that persists.** A redeploy MUST NOT reset it. Tenon creates and updates its tables on the first request.
- **A place for media files.** A disk that persists, or a bucket.
- **The secret.** `TENON_SECRET`, at least 32 characters, signs sessions.
- **The public URL.** `TENON_SITE_URL`, the origin of the site, like `https://example.com`. Sign-in, the sitemap and links in emails use it.

`npm create tenoncms@latest` asks where the site runs, and offers only the databases, storages and image providers that work there. See [create-tenoncms](/docs/cli/create-tenoncms).

## Pick a target

| Target     | Frameworks                              | Database                        | Media storage      | Images                                 | Email                          |
| ---------- | --------------------------------------- | ------------------------------- | ------------------ | -------------------------------------- | ------------------------------ |
| Node       | Astro, Nuxt, TanStack Start, Standalone | SQLite, Turso, Postgres, PGlite | Local disk, S3, R2 | IPX, or an image service               | SMTP, Cloudflare Email Service |
| Vercel     | Astro, Nuxt, TanStack Start, Standalone | Turso, Postgres                 | S3, R2             | Vercel Image Optimization, IPX, others | SMTP, Cloudflare Email Service |
| Cloudflare | Astro                                   | A Durable Object                | R2                 | Cloudflare Images, or an image service | Cloudflare Email Service, SMTP |

- Pick **Node** for a server or a container you run. It is the simplest setup: a SQLite file and a folder for uploads are enough.
- Pick **Vercel** for serverless functions. The disk does not keep files, so you need a database server and a bucket.
- Pick **Cloudflare** to run on Workers. The CMS lives in a Durable Object with its own database.

Other hosts work the same way. A host that runs a Node server follows the Node guide. A serverless host follows the Vercel guide: a database server, a bucket and an outside clock for jobs.

::card-group
:::card{title="Node" icon="i-simple-icons-nodedotjs" to="/docs/guide/deployment/node"}
A server or a container, with a disk that persists.
:::

:::card{title="Vercel" icon="i-simple-icons-vercel" to="/docs/guide/deployment/vercel"}
Serverless functions with Postgres or Turso and a bucket.
:::

:::card{title="Cloudflare" icon="i-simple-icons-cloudflare" to="/docs/guide/deployment/cloudflare"}
Workers, with the CMS in a Durable Object.
:::
::

To choose the parts, see [Databases](/docs/guide/databases-and-storage/databases), [Media storage](/docs/guide/databases-and-storage/media-storage) and [Image providers](/docs/guide/databases-and-storage/image-providers).

## Run the CMS on its own origin

A [Standalone](/docs/guide/frameworks/standalone) project runs only the API and the admin, for example at `cms.example.com`. It deploys like any other project, on Node or Vercel.

When the site runs on another origin, the CMS MUST set both origins:

```ts [tenon.config.ts]
export default defineCms({
  // ...
  site: { url: "https://www.example.com" },
  auth: { baseURL: "https://cms.example.com" },
});
```

For drafts, the admin bar and the live preview on the site, the two hosts also share cookies on their parent domain. See [Headless](/docs/core/working-with-content/headless#set-the-origins) for the cookies, CORS and its [production checklist](/docs/core/working-with-content/headless#production-checklist).

## Before going live

- [ ] `TENON_SECRET` is a new random value: `openssl rand -hex 32`. Do not reuse the one from development. A changed secret signs everyone out.
- [ ] `TENON_SITE_URL` is the public origin, with `https`.
- [ ] The database and the media files survive a redeploy.
- [ ] You open `/admin` right after the first deploy and create the first admin. Until then, anyone who opens it can.
- [ ] [Email](/docs/core/operations/email) is set up, so invites and password resets reach people.
- [ ] Something runs the [job clock](/docs/core/operations/jobs/clock), if you use scheduled publishing, jobs or webhooks.
- [ ] You have a backup plan, like [`tenon backup --url`](/docs/cli/backup) on a schedule.

## Related resources

- [Configuration](/docs/core/getting-started/configuration#environment-variables): how each framework reads the variables.
- [Authentication](/docs/core/users-and-access/authentication#the-cms-origin): the CMS origin and more than one host.
- [Backup and restore](/docs/core/operations/backup-and-restore): move content between environments.
- [Upgrades and schema changes](/docs/core/operations/upgrades-and-schema-changes): what happens to the database on a new version.
