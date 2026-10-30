# Your first site

A path from an empty project to a deployed site with pages, a blog and an admin. Each step lists what to do and links to the guide with the details. The examples use Astro. For Nuxt or TanStack Start, swap step 2 with [Framework setup](frameworks.md) and keep the rest.

Finished code to compare with: `examples/astro`.

## 1. Create the project

- [ ] `pnpm create astro@latest my-site`, then `pnpm add @astrojs/node`.
- [ ] Install tenoncms. It is not on npm yet, so install the tarball:

  ```sh
  # in the tenoncms repo: writes dist/tenoncms-<version>.tgz
  pnpm tarball

  # in my-site
  pnpm add ../tenoncms/dist/tenoncms-0.19.0.tgz @libsql/client
  ```

- [ ] Add `cms.db*` and `.uploads` to `.gitignore`.

## 2. Wire up the framework

- [ ] Add the integration and an SSR adapter. See [Astro](frameworks.md#astro).

  ```ts
  // astro.config.ts
  import node from "@astrojs/node";
  import { defineConfig, envField } from "astro/config";
  import tenonCms from "tenoncms/astro";

  export default defineConfig({
    adapter: node({ mode: "standalone" }),
    integrations: [tenonCms()],
    env: {
      schema: {
        CMS_SECRET: envField.string({ context: "server", access: "secret", min: 32 }),
        DATABASE_URL: envField.string({
          context: "server",
          access: "secret",
          default: "file:./cms.db",
        }),
        SITE_URL: envField.string({
          context: "server",
          access: "public",
          url: true,
          default: "http://localhost:4321",
        }),
      },
    },
  });
  ```

- [ ] Create `.env` with `CMS_SECRET=$(openssl rand -hex 32)`.

## 3. Create the instance

- [ ] Add `tenon.config.ts` at the project root, with no collections yet:

  ```ts
  import { CMS_SECRET, DATABASE_URL, SITE_URL } from "astro:env/server";
  import { defineCms } from "tenoncms";
  import { libsql } from "tenoncms/libsql";

  export default defineCms({
    collections: {},
    database: libsql(DATABASE_URL),
    secret: CMS_SECRET,
    site: SITE_URL,
  });
  ```

- [ ] `pnpm dev`, open `/admin` and choose "Create the admin account". Only the first user can sign up.

Check: the admin loads and you are signed in.

## 4. Model the content

Start small. Add fields when a page needs them.

- [ ] **Pages** with nested paths and SEO fields, from the presets. See [The page preset](pages-and-seo.md#the-page-preset).
- [ ] **Posts** with `title`, `slug`, `body` (`richtext`) and an `image`. See [Schema and fields](schema.md), [Rich text](richtext.md) and [Media](media.md#image-and-file-fields).
- [ ] **Authors**, linked from posts with a `relation`. See [Relations](relations.md).
- [ ] **Site settings**: the `general` and `seo` globals are built in. Add your own globals for the footer or navigation. See [Settings](pages-and-seo.md#settings).
- [ ] Page sections as `blocks`, if editors build pages from parts. See [Lists and blocks](lists-and-blocks.md).
- [ ] Register everything in `tenon.config.ts` and restart.

Check: you can create, save and publish a page and a post in the admin. Every save is a draft until you publish. See [Drafts](drafts.md).

## 5. Render the site

- [ ] A catch-all page route reads `pages` by `path`. See [Read a page](pages-and-seo.md#read-a-page).
- [ ] `/blog` lists posts, `/blog/[slug]` shows one. Use `select` and `populate` to load only what the page shows. See [Reading and writing](reading.md).
- [ ] Render rich text with the `Richtext` component. See [Rich text](richtext.md).
- [ ] Responsive images from the media API. See [The media API](media.md#the-media-api).
- [ ] Head tags with `seoMeta()`, and `breadcrumbs()` for nested pages. See [SEO tags](pages-and-seo.md#seo-tags).
- [ ] Set `export const prerender = false` on pages that read live content.

Check: published content shows up, drafts do not.

## 6. Make editing pleasant

- [ ] Add `permalink` to pages and posts, so the admin can open a preview. See [Say where a document lives](live-preview.md#1-say-where-a-document-lives).
- [ ] Mark rendered fields with `edit()` for click-to-edit. See [Live preview](live-preview.md).
- [ ] Group and order the admin navigation, set the admin name. See [Customize the admin](admin.md).

Check: editing a draft in the admin updates the preview before you save.

## 7. Add what the site needs

Only when you need it:

- [ ] Other editors: roles, invites and access rules. Invites need email. See [Auth, users and access](auth-and-access.md) and [Email](email.md).
- [ ] Logic on save, such as notifications or derived fields. See [Hooks](hooks.md).
- [ ] More than one language. See [Localization](localization.md).
- [ ] Redirects, or your own plugin. See [Plugins](plugins.md).
- [ ] Forms that write content, such as comments. See [Browser client](reading.md#browser-client).

## 8. Deploy

- [ ] `pnpm build`, then `node --env-file=.env ./dist/server/entry.mjs`.
- [ ] Set `CMS_SECRET`, `DATABASE_URL` and `SITE_URL` (the public URL, used by the admin preview) on the server.
- [ ] Keep the database and uploads on a persistent disk, or use Turso and S3. See [Storage](media.md#storage).
- [ ] Serverless or edge: see [Astro on Vercel](frameworks.md#astro-on-vercel) and [Astro on Cloudflare](frameworks.md#astro-on-cloudflare).
- [ ] Back up the database file. It holds all content and users.

Check: sign in on the live site and publish a change.
