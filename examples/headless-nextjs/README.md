# Headless site with Next.js

The finished code of the guide [Build a headless site with Next.js](https://tenoncms.com/docs/guide/recipes/build-a-headless-site-with-nextjs). A Next.js site reads its content from a Tenon CMS on another origin. A signed-in editor sees drafts, the admin bar and the live preview.

- `cms/` is a standalone Tenon project, on port 3200.
- `site/` is a Next.js 16 app, on port 3000. It imports only `tenoncms/client`, `tenoncms/preview` and `tenoncms/react`.

Unlike the other examples, both use `tenoncms` from npm. Copy this folder out of the repository and it runs as it is.

## Run it

Start the CMS:

```sh
cd cms
cp .env.example .env
npm install
npm run dev -- --port 3200
```

Start the site in a second terminal:

```sh
cd site
cp .env.example .env.local
npm install
npm run dev
```

Install both. The site imports the types of `cms/tenon.config.ts`, and they need `cms/node_modules`.

1. Open <http://localhost:3200/admin> and create the first admin.
2. Create a post, add a cover image and publish it.
3. Open <http://localhost:3000>. You are signed in, so the admin bar shows at the bottom.
4. Switch the bar to **Drafts** or **Published**. The page reloads with that version.
5. Select **Edit** in the bar. The admin opens the page in its visual editor. Switch the form to the draft and type: the page follows as you type.

Before you deploy, set a new `TENON_SECRET` (`openssl rand -hex 32`) and follow the [production checklist](https://tenoncms.com/docs/core/working-with-content/headless#production-checklist).
