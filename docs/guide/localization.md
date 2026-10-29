# Localization

Editors write a document in several languages. Each language (locale) has its own draft and publish state. Fields that do not change per language are stored once.

## Set it up

```ts
defineCms({
  localization: {
    locales: ["en", "de"],
    defaultLocale: "en",
    // Default true. A missing value or locale reads as the default locale's.
    fallback: true,
    // Default { prefix: "except-default" }: /about and /de/about. "always": /en/about too. `false`: you route on your own.
    routing: { prefix: "except-default" },
  },
  collections: {
    posts: defineCollection({
      // Fields are localized unless they set `localized: false`.
      localized: true,
      permalink: "/posts/{slug}",
      fields: {
        title: { type: "text", required: true },
        slug: { type: "slug", from: "title", required: true },
        hero: { type: "image", localized: false }, // shared by all locales
      },
    }),
  },
});
```

- `localized: true` on a collection or global turns it on. It needs `localization`, or startup throws. The `media` collection MUST NOT be localized.
- `localized: false` on a field shares it across locales.
- A group, an `array` and a `blocks` field are localized as a whole. Fields inside them MUST NOT set `localized`. Joins are never stored, so they are never localized.
- Relation, image and file fields MAY be localized.
- `defaultLocale` MUST be one of `locales`. `locales` MUST NOT be empty or hold duplicates.
- With `localization` set, the default `general` and `seo` globals are localized.
- Collections and globals without `localized` behave as before and ignore `locale`. A `locale` without `localization` throws a `ValidationError`.

## Reads

```ts
await cms.find("posts", { locale: "de" });
await cms.findOne("posts", { where: { slug: "hallo" }, locale: "de", fallback: false });
await cms.getGlobal("general", { locale: "de" });
// HTTP: GET /_tenon/collections/posts?locale=de&fallback=false
```

- `locale` defaults to `defaultLocale`. `fallback` defaults to the config. An unknown locale throws a `ValidationError` (400).
- With `fallback`, a missing value (or `null`) reads as the default locale's, and a document published only in the default locale is still visible. Without it, a document needs a published version in the requested locale.
- `where` filters and `unique` follow the same fallback, so a filter matches the value the read returns.
- `populate` reads related documents in the same locale. Hooks and their nested `cms` calls inherit it, and every hook gets `locale`.
- Documents of a localized collection carry extra fields. Globals get the same three. `select` lists them like `id`.
  - `locale`: the locale of the read.
  - `locales`: the locales that have a version (published ones, or every one with a row in the drafts perspective).
  - `sharedDraft`: whether the shared fields have a pending draft.
- `alternates: true` adds `alternates` to a document: one URL per published locale, plus `"x-default"` for the default locale. It needs a `permalink` on the collection, costs one batched read per locale, and is typed only when the option is set.

## Writes, drafts and publishing

```ts
const post = await cms.create("posts", { title: "Hello" }, { locale: "en", draft: true });
await cms.update("posts", post.id, { title: "Hallo" }, { locale: "de", draft: true });
await cms.publish("posts", post.id, { locale: "de" });
await cms.discard("posts", post.id, { locale: "de" }); // only the German draft
await cms.discard("posts", post.id, { all: true }); // every draft, shared fields included
```

- Writes default to `defaultLocale`. A document MAY be created in any locale.
- Defaults, hooks and validation run on the whole document: the shared fields plus the fields of the written locale.
- Shared fields live on the document. Localized ones live in one row per locale. A draft is saved per locale. A publish publishes that locale and the pending shared fields, so `required` is checked for the published locale only.
- `discard` drops one locale's draft and keeps the shared draft, because another locale MAY have edited it. A locale that was never published loses its row, and a never-published document is deleted. `{ all: true }` ignores `locale`.
- Over HTTP, every write route takes `?locale=`. `DELETE …/draft?all=true` drops all drafts.

### Copy and remove translations

Copy the fields of one locale into another as a draft, or delete a translation:

```ts
await cms.copyLocale("posts", id, { from: "en", to: "de" }); // replaces the pending German draft
await cms.removeLocale("posts", id, "de"); // the default locale and the last locale stay
await cms.copyGlobalLocale("general", { from: "en", to: "de" });
await cms.removeGlobalLocale("general", "de");
// HTTP: POST /collections/:name/:id/locales/:to/copy { "from": "en" }, DELETE /collections/:name/:id/locales/:locale
```

References that point to a document are found in locale rows too, so `onDelete` (`restrict`, `set-null`, `cascade`) and media usage see every locale.

## Changing the config later

`localized` options and `defaultLocale` MAY change. On the first database access, the CMS compares the localized fields with the last run and moves the values: shared to the default locale's row, or back.

- Other locales keep their rows. Reads ignore their values while a field is shared, so switching back restores them.
- Each move is logged, for example `moved posts.title to locale rows (12 documents)`.
- A changed `defaultLocale` moves nothing. It logs a warning with the number of documents that have no row in it.
- A locale removed from `locales` keeps its rows. Reads ignore them.

## URLs, `hreflang` and the language switch

`permalink` is the template of a document's public URL, with the same forms as `preview`. Your routes MUST serve it. With `routing`, keep templates free of the locale: the CMS adds the prefix (`/posts/{slug}` becomes `/de/posts/hallo`). With `routing: false`, a template MAY use `{locale}`.

Pure helpers, from `tenoncms` and `tenoncms/client`:

```ts
import { localeFromPath, localizePath, switchTarget } from "tenoncms/client";

localeFromPath("/de/about", localization); // { locale: "de", path: "/about" }
localizePath("/about", "de", localization); // "/de/about"
switchTarget(localization, "/about", "de", page.alternates);
```

`switchTarget()` uses the document's alternate in the target locale, or that locale's homepage when the translation is missing. `localization` is `cms.localization` on the server. In the browser, `await client.localization()` fetches the public `GET /_tenon/localization` once per client (`null` without `localization`), so the browser never imports `tenon.config.ts`.

`seoMeta()` turns `alternates` into `hreflang` tags. `alternates` is a list of `{ hreflang, href }`, absolute against the site `url`, and `canonical` is the URL of the page's own locale.

```astro
---
const { canonical, alternates } = seoMeta(page, { general, seo });
---

<html lang={Astro.locals.locale}>
  <head>
    <link rel="canonical" href={canonical} />
    {alternates.map((a) => (
      <link rel="alternate" hreflang={a.hreflang} href={a.href} />
    ))}
  </head>
</html>
```

### Per framework

- **Astro**: the middleware sets `Astro.locals.locale` and `Astro.locals.path` (the path without the prefix) from the URL. Read with `{ where: { path: Astro.locals.path }, locale: Astro.locals.locale, alternates: true }` and pass the document's `alternates` to the header and the language switch. The catch-all route serves prefixed URLs as they are. Other routes MUST exist for the prefixed URLs too, for example under `src/pages/[...locale]/`. The integration adds no route folder.
- **Nuxt**: `useLocale()` returns `locales`, `defaultLocale`, `locale`, `path`, `localePath(path, locale?)`, `switchLocalePath(locale)` and `switchLocale(locale)`. `useAlternates(() => page.value?.alternates)` registers the page's translations. `switchLocalePath()` returns a translation's URL, or the locale's homepage when it is missing. `switchLocale()` navigates there. Render the header inside the page after its document loads, so server-rendered language links have the alternates. `useTenon()` reads in the route's locale unless the options set one.
- **TanStack Start and others**: `client.localization()` plus the helpers above.

## In the admin

When `localization` is set, the top bar has a language menu next to the perspective menu. The choice is kept in the browser and reloads nothing. An admin URL with `?locale=` sets it. Collections and globals that are not localized ignore it.

- The form edits the active language. Empty localized fields show the default language's value as a placeholder, and shared fields carry a "Same in all languages" marker.
- The document header shows the active language's state (Published, Draft, Not translated) and a row of language codes with status dots. A click switches the language.
- The "…" menu has "Copy from…", "Copy to…", "Remove translation" and "Discard all changes". Each asks first.
- Lists show the active language with fallback and mark rows that have no translation.
- Live preview opens the page of the active language. The admin bar's Edit link on a site page carries the page's `<html lang>`.

## Site strings

Short texts a site hardcodes, like a "Read more" button, go into a `strings` global. Each key becomes a text field that editors translate on the Settings page:

```ts
import { strings } from "tenoncms/presets";

defineCms({
  globals: {
    strings: strings({
      readMore: { label: "Read more link", default: { en: "Read more", de: "Weiterlesen" } },
      subscribe: "Subscribe",
    }),
  },
});

const text = await cms.getGlobal("strings", { locale, fallback: false });
text.readMore; // the stored text, else the code default of `locale`
```

- A default is one text for every locale, or one per locale. A locale without an entry gets the first one.
- `{ label, default }` sets the field label in the admin. Without it, the label is the key. In this form, no locale MAY be named `default`.
- Read with `fallback: false`. Otherwise a text stored in the default locale wins over another locale's code default.
- A text equal to its code default is not stored, so a later change of a code default reaches every locale that did not change that text.
- Read the global once per page, for example in the layout, and pass the texts down.
- The global is localized, so it needs `localization`.

## Redirects

The `redirects` plugin has a `locale` field. A redirect without one applies to every locale, and `from` is unique per locale. `resolveRedirect(cms, path, locale?)` and `GET …/redirects/lookup?path=&locale=` prefer the locale's redirect.
