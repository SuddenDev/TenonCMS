# Plan: Page and SEO preset

Spec: `docs/superpowers/specs/2026-09-24-page-preset-design.md`. Runs last, after specs 4, 1, 2, 3 and 6. The plan assumes all of them exist: Kysely, `group`, `relation` / `join` with `populate` and `onDelete`, hooks with transactions and `ValidationError`, and the field options (`condition` with `src/condition.ts`, `default`, `private` / `hidden`, the admin's `root` and `isNew` props).

Paths are relative to `packages/core` unless noted. Run one test with `pnpm --filter integral-cms test -- <file> -t '<name>'`, type tests with `pnpm --filter integral-cms typecheck` (vitest does not typecheck, so `@ts-expect-error` only fails there). No build is needed for tests.

`ValidationError` and `ConflictError` live in `src/errors.ts`, a file with no imports (specs 2 and 3). Other names from earlier specs (the HTTP error body shape, admin props, the `unique` list in spec 6's startup check) are written as they appear in the specs and plans. If the code uses other names, use those.

## Decisions

- **`readOnly` is an admin hint (spec).** Core only adds the option to `Base`. No stripping, no input type. The `path` hook overwrites `path` in `beforeChange`.
- **`slugify` and the slug pattern live in `src/slugify.ts`, with no imports**, like `src/condition.ts` (spec 6). The admin imports it by relative path and Vite bundles it. It exports `slugify(text)` and `SLUG_PATTERN = '[a-z0-9]+(-[a-z0-9]+)*'`, which zod and the admin's `pattern` attribute both use.
- **`slugify` rules**: `normalize('NFKD')`, drop combining marks, `ß` → `ss`, lowercase, runs of non-`[a-z0-9]` to `-`, trim `-`. So `Über uns!` → `uber-uns`.
- **A `slug` counts as required everywhere `required: true` does**: the key filter in `Data`, `Req` in the read types (spec 2) and the `required` branch of `dataSchema()` (spec 6).
- **The slug input needs its siblings.** `FieldInput.vue` gets a `siblings: { fields: Fields; data: Record<string, unknown> }` prop. `DocForm.vue` passes the collection's fields and `data`; the group branch passes the group's fields and model. The slug input reads `from` and `parent` through it.
- **The parent prefix reads the parent document's field named by the slug's `path` option** (default `'path'`, spec), loaded with `client.findById(target, id, { populate: false })`.
- **`unique` on `slug` is wired here** (spec). Spec 6 ran first and allows `unique` on the other types only. Task 4 adds `'slug'` to spec 6's `unique` list.
- **Presets import errors from `./errors.ts`**, never from `./index.ts` or `./schema.ts`. `src/errors.ts` has no imports, so zod does not reach browser bundles that import `seoMeta`.

## Tasks

### Task 1: `readOnly` option

RED

- `src/schema.test.ts`, new `describe('readOnly')`:

```ts
const fields = {
  title: { type: "text", required: true },
  path: { type: "text", readOnly: true },
  seo: { type: "group", fields: { title: { type: "text", readOnly: true } } },
} as const satisfies Fields;

it("accepts readOnly at any depth and keeps it writable", () => {
  const input: Data<typeof fields> = { title: "A", path: "/a", seo: { title: "S" } };
  void input;
});
```

- Run: `pnpm --filter integral-cms typecheck`. Expected failure: `readOnly` does not exist in type `Field`.

GREEN

- `src/schema.ts`, in `Base`: `/** The admin shows the field disabled. The API and hooks can still write it. */ readOnly?: boolean`.
- Run the typecheck again. Expect pass.

Commit: `feat(core): add readOnly field option`

### Task 2: Admin shows `readOnly` fields disabled

No automated test (the admin has none).

- `packages/admin/src/components/FieldInput.vue`: `:disabled="field.readOnly"` on the checkbox, `textarea`, `select`, both `input`s, the relation select from spec 2 and the group `<fieldset>` from spec 1 (a disabled fieldset disables its children). Custom fields get `field` in `ctx` already; the host decides.
- `DocForm.vue` keeps sending the value.
- Manual check: `pnpm build:packages`, then `pnpm dev:astro` with a temporary `readOnly` field on `posts` in `examples/astro/collections/posts.ts`, once at the top level and once inside a group. On `localhost:5173/admin/` both are greyed out and cannot be focused; saving works. Revert the example change.

Commit: `feat(admin): disable readOnly fields`

### Task 3: `slugify`

RED

- New `src/slugify.test.ts`:

```ts
import { SLUG_PATTERN, slugify } from "./slugify.ts";

it.each([
  ["Über uns", "uber-uns"],
  ["  Hello,   World!  ", "hello-world"],
  ["--Straße 5--", "strasse-5"],
  ["C’est la vie", "c-est-la-vie"],
  ["", ""],
])("slugify: %s", (text, expected) => expect(slugify(text)).toBe(expected));

it("produces values that match the pattern", () => {
  expect(new RegExp(`^(?:${SLUG_PATTERN})$`, "v").test(slugify("Über uns!"))).toBe(true);
});
```

- Run: `pnpm --filter integral-cms test -- src/slugify.test.ts`. Expected failure: `Cannot find module './slugify.ts'`.

GREEN

- New `src/slugify.ts`, no imports:

```ts
/** Admin and server MUST both use this file. It MUST stay free of imports; the admin bundles it. */
export const SLUG_PATTERN = "[a-z0-9]+(-[a-z0-9]+)*";

export function slugify(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
```

- Run again. Expect pass.

Commit: `feat(core): add slugify`

### Task 4: `slug` field type in core

RED

- `src/schema.test.ts`, `describe('slug')`:

```ts
const s = dataSchema({ slug: { type: "slug", from: "title" } });

it("requires a slug that matches the pattern", () => {
  for (const ok of ["a", "about-us", "v2"])
    expect(s.safeParse({ slug: ok }).success, ok).toBe(true);
  for (const bad of [
    {},
    { slug: null },
    { slug: "" },
    { slug: "Not Valid" },
    { slug: "a--b" },
    { slug: "-a" },
    { slug: "a-" },
  ])
    expect(s.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
});

it("types a slug as a required string", () => {
  const f = {
    slug: { type: "slug", from: "title", parent: "parent", path: "path" },
  } as const satisfies Fields;
  (d: Data<typeof f>) => d.slug satisfies string;
  // @ts-expect-error a slug is always required
  const missing: Data<typeof f> = {};
  // @ts-expect-error `required` does not apply to slugs
  defineCollection({ fields: { s: { type: "slug", required: false } } });
});
```

- `src/schema.test.ts`, in spec 6's `describe('defineCms checks')`, extend `accepts unique on top-level …` with `{ s: { type: 'slug', from: 'title', unique: true } }`. Add `throws for unique on a slug inside a group`.
- `src/app.test.ts`, spec 6's `describe('unique')`, test `rejects a used slug`: a `posts` collection with `title` and `slug: { type: 'slug', from: 'title', unique: true }` (the blog post case). A second `client.create` with the same slug → 400 with `errors: { slug: 'Already used' }`.
- Run: `pnpm --filter integral-cms test -- src/schema.test.ts -t slug`, `pnpm --filter integral-cms test -- src/app.test.ts -t unique` and `pnpm --filter integral-cms typecheck`. Expected failure: `fieldSchema` falls to its default branch (any string, optional), so `{}` and `'Not Valid'` pass; `type: 'slug'` is not in `Field`; `defineCms` throws `"posts.slug" cannot be unique`.

GREEN

- `src/schema.ts`:

```ts
// `path`: the parent's field shown as the admin prefix. Default 'path'.
| (Omit<Base, 'required'> & { type: 'slug'; from?: string; parent?: string; path?: string })

// fieldSchema
case 'slug':
  return z.string().regex(new RegExp(`^(?:${SLUG_PATTERN})$`, 'v'))
```

- `dataSchema()`: the required branch becomes `on && (field.required || field.type === 'slug')`.
- `Data`: the required-key filter becomes `F[K] extends { required: true } | { type: 'slug' }`. Same for `Req` in the read types from spec 2.
- Spec 6's startup check: add `'slug'` to the `unique` list. Update the `Base.unique` doc comment to name `slug`.
- Run both commands again, then `pnpm --filter integral-cms test`. Expect green.

Commit: `feat(core): add slug field type with unique support`

### Task 5: Slug input in the admin

No automated test (the admin has none).

- `packages/admin/src/api.ts`: `export { SLUG_PATTERN, slugify } from '../../core/src/slugify'`.
- `FieldInput.vue`: new prop `siblings` (see Decisions). `DocForm.vue` passes `{ fields, data }`; the group branch passes `{ fields: field.fields, data: model }` to its children. `isNew` (spec 6, Task 16) is passed down the same way.
- A `slug` branch:

```vue
<div v-else-if="field.type === 'slug'" class="flex items-center gap-1">
  <span class="text-zinc-500">{{ prefix }}</span>
  <input v-model="model" class="input" required :pattern="SLUG_PATTERN" :disabled="field.readOnly" @input="edited = true" />
</div>
```

```ts
// New documents follow the source field until the editor edits the slug. Existing slugs never change, so URLs stay stable.
const edited = ref(false);
watch(
  () =>
    props.field.type === "slug" && props.field.from
      ? props.siblings?.data[props.field.from]
      : undefined,
  (text) => {
    if (props.isNew && !edited.value && typeof text === "string") model.value = slugify(text);
  },
);

const prefix = ref("/");
watch(
  () =>
    props.field.type === "slug" && props.field.parent
      ? props.siblings?.data[props.field.parent]
      : undefined,
  async (id) => {
    const relation =
      props.field.type === "slug" && props.field.parent
        ? props.siblings?.fields[props.field.parent]
        : undefined;
    const parent =
      typeof id === "string" && relation?.type === "relation"
        ? await client.findById(relation.collection, id, { populate: false })
        : undefined;
    const value = parent?.[props.field.type === "slug" ? (props.field.path ?? "path") : "path"];
    prefix.value = `${typeof value === "string" ? value.replace(/\/$/, "") : ""}/`;
  },
  { immediate: true },
);
```

- Manual check with the Astro example's `pages` collection (Task 14) or a temporary one: a new page's slug follows the title while typing; editing the slug stops that; an existing page keeps its slug when the title changes; picking a parent shows its path as the prefix (`/about/`), clearing it shows `/`; a temporary slug with `path: 'url'` on a collection whose parents have a `url` field shows that value; `Not Valid` blocks the save.
- `pnpm --filter @integral-cms/admin typecheck`.

Commit: `feat(admin): fill slugs from their source field`

### Task 6: `integral-cms/presets` with `page.fields` and `slugFromTitle`

RED

- New `src/presets.test.ts`:

```ts
import { page } from "./presets.ts";

const fill = (data: object) => page.hooks.beforeValidate.slugFromTitle({ data } as any);

it("slugFromTitle fills an empty slug", () => {
  expect(fill({ title: "Über uns" })?.slug).toBe("uber-uns");
  expect(fill({ title: "Über uns", slug: "" })?.slug).toBe("uber-uns");
});

it("slugFromTitle keeps a given slug", () => {
  expect(fill({ title: "A", slug: "b" })).toBeUndefined();
});
```

- `src/schema.test.ts`, test `types a collection built from page.fields`: `Doc<typeof page.fields>['title']` and `['slug']` are `string`.
- Run: `pnpm --filter integral-cms test -- src/presets.test.ts`. Expected failure: `Cannot find module './presets.ts'`.

GREEN

- New `src/presets.ts`:

```ts
import type { Fields } from "./schema.ts";
import { slugify } from "./slugify.ts";

const fields = {
  title: { type: "text", required: true },
  slug: { type: "slug", from: "title", parent: "parent", path: "path" },
  parent: { type: "relation", collection: "pages", onDelete: "restrict" },
  path: { type: "text", readOnly: true },
} as const satisfies Fields;

// Presets MUST fit any collection, so hook arguments are untyped.
export function treeHooks() {
  return {
    beforeValidate: {
      slugFromTitle: ({ data }: any) =>
        data.slug ? undefined : { ...data, slug: slugify(String(data.title ?? "")) },
    },
  };
}

export const page = { fields, hooks: treeHooks() };
```

`as const` keeps the literal types, so a spread into `defineCollection` infers `title` and `slug` as required.

- `tsdown.config.ts`: add `'src/presets.ts'` to `entry`. `package.json` `exports`:

```json
"./presets": { "types": "./dist/presets.d.mts", "default": "./dist/presets.mjs" }
```

- Run the test file and `pnpm --filter integral-cms typecheck`. Expect pass. Then `pnpm build:packages && ls packages/core/dist/presets.*` (from the repo root; no watcher running) shows `presets.mjs` and `presets.d.mts`.

Commit: `feat(core): add presets export with page fields and slug hook`

### Task 7: `path` hook

RED

- `src/presets.test.ts`, path rules through the hook with a fake `cms`:

```ts
const path = async (slug: string, parentPath?: string) =>
  (
    await page.hooks.beforeChange.path({
      data: { slug, parent: parentPath === undefined ? null : "p" },
      collection: "pages",
      cms: { findById: async () => ({ path: parentPath }) },
    } as any)
  )?.path;

it("path: index at root is /", async () => expect(await path("index")).toBe("/"));
it("path: root page", async () => expect(await path("about")).toBe("/about"));
it("path: child of / has one slash", async () => expect(await path("child", "/")).toBe("/child"));
it("path: nested child", async () =>
  expect(await path("berlin", "/about/team")).toBe("/about/team/berlin"));
```

- `src/app.test.ts`: let `setup()` take the instance (`function setup(cms = define('x'.repeat(32)))`). Add a `pages` fixture and `describe('page preset')`:

```ts
let failSlug: string | undefined;
const definePages = () =>
  defineCms({
    collections: {
      pages: {
        titleField: "title",
        fields: { ...page.fields, body: { type: "textarea" } },
        hooks: {
          beforeValidate: page.hooks.beforeValidate,
          beforeChange: {
            ...page.hooks.beforeChange,
            // Lets a test fail one descendant update.
            fail: ({ originalDoc }: any) => {
              if (originalDoc?.slug === failSlug) throw new Error("boom");
            },
          },
          afterChange: page.hooks.afterChange,
        },
      },
    },
    database: { url: ":memory:" },
    secret: "x".repeat(32),
  });

// Field keys of a 400 body, for ValidationError and zod errors alike.
async function fieldErrors(promise: Promise<unknown>) {
  const e = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!(e instanceof CmsError)) return e;
  return [
    e.status,
    [
      ...Object.keys(e.body?.errors ?? {}),
      ...(e.body?.error ?? []).map((i: any) => i.path.join(".")),
    ],
  ];
}
```

`beforeEach`: `failSlug = undefined`, `setup(definePages())`, sign up. `afterChange` and the extra `beforeChange` keys are empty records until later tasks.
Tests:

- `stores nested paths`: create `about`, `team` (parent about), `berlin` (parent team) via `client.create`; `cms.findById(..., { populate: false })` paths are `/about`, `/about/team`, `/about/team/berlin`.
- `stores / for index at root`.
- `fills an empty slug from the title`: `{ title: 'Über uns', slug: '' }` stores `slug: 'uber-uns'`, `path: '/uber-uns'`.
- `rejects an invalid slug`: `{ title: 'A', slug: 'Not Valid' }` → `[400, ['slug']]`.
- `overwrites path in input`: `client.create('pages', { title: 'A', slug: 'a', path: '/x' })` stores `/a`; `cms.update('pages', id, { title: 'A', slug: 'a', path: '/y' })` keeps `/a`. `readOnly` is admin-only, so the hook MUST overwrite.
- `reads a page by path over HTTP`: `fetch('/api/cms/collections/pages?path=/about/team')` without a cookie returns `[team]`.
- Run: `pnpm --filter integral-cms test -- src/presets.test.ts src/app.test.ts -t path`. Expected failure: `page.hooks.beforeChange` is undefined and stored paths are missing.

GREEN

- `src/presets.ts`, in `treeHooks()`:

```ts
beforeChange: {
  async path({ data, collection, cms }: any) {
    const parentPath = data.parent && (await cms.findById(collection, data.parent, { populate: false }))?.path
    const own = parentPath ? `${parentPath === '/' ? '' : parentPath}/${data.slug}` : data.slug === 'index' ? '/' : `/${data.slug}`
    return { ...data, path: own }
  },
},
afterChange: {},
```

- Run the same command, then the full suite. Expect green.

Commit: `feat(core): compute page paths from parent and slug`

### Task 8: `uniquePath`

RED

- `describe('page preset')`: `rejects a duplicate path`: a second root `about` → `[400, ['slug']]`; `team` under `about` and `team` under `contact` both succeed. Also on update: renaming `contact` to slug `about` → `[400, ['slug']]`; updating `about` with its own slug passes.
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t 'duplicate path'`. Expected failure: the second `about` returns 201.

GREEN

- `beforeChange.uniquePath`, after `path` in the record:

```ts
async uniquePath({ data, id, collection, cms }: any) {
  const other = await cms.findOne(collection, { where: { path: data.path }, populate: false })
  if (other && other.id !== id) throw new ValidationError({ slug: 'Already used on this level' })
},
```

Import `ValidationError` from `./errors.ts`, not from `./index.ts` or `./schema.ts`. Both import zod, and `presets.ts` runs in browser bundles.

- Run again, then the full suite.

Commit: `feat(core): reject duplicate page paths`

### Task 9: `noCycle`

RED

- `rejects moving a page under its own descendant`: `about` → `team` → `berlin`; `client.update('pages', about.id, { title: 'About', slug: 'about', parent: berlin.id })` → `[400, ['parent']]`, and `about`'s stored `parent` stays `null`.
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t descendant`. Expected failure: 200, the update stores the cycle.

GREEN

- `beforeChange.noCycle`, first in the record:

```ts
async noCycle({ data, id, collection, cms }: any) {
  const seen = new Set<string>()
  for (let cur = data.parent; cur && !seen.has(cur); cur = (await cms.findById(collection, cur, { populate: false }))?.parent) {
    if (cur === id) throw new ValidationError({ parent: 'A page cannot be inside itself' })
    seen.add(cur)
  }
},
```

The walk also catches `parent === id`. `seen` ends the loop on a cycle that already exists in the data.

- Run again, then the full suite.

Commit: `feat(core): reject cycles in page trees`

### Task 10: `descendantPaths`

RED

- `rewrites descendant paths on rename`: `about` → `team` → `berlin`; rename `about` to slug `company` via `client.update`; stored paths are `/company`, `/company/team`, `/company/team/berlin`.
- `rolls back a rename when a descendant update fails`: same tree, `failSlug = 'berlin'`, the rename returns 500; all three stored paths are unchanged (`/about…`).
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t 'rename'`. Expected failure: children keep `/about/team`; the rollback test fails because the rename returns 200.

GREEN

- `afterChange.descendantPaths`:

```ts
async descendantPaths({ doc, previousDoc, collection, cms }: any) {
  if (doc.path === previousDoc?.path) return
  for (const { id, createdAt, updatedAt, ...data } of await cms.find(collection, { where: { parent: doc.id }, populate: false }))
    await cms.update(collection, id, data)
},
```

Each child's own `path` hook recomputes its path and its `descendantPaths` recurses. All of it runs in the write transaction (spec 3), so the failing grandchild rolls back the rename.

- Run again, then the full suite.

Commit: `feat(core): rewrite descendant paths when a page moves`

### Task 11: Guards for delete and hook omission

These pass on the code from Tasks 7–10 and specs 2 and 3. They guard the preset's contract. If one fails, fix the cause here.

- `refuses to delete a page with children`: `client.delete` on `about` → 409, body lists `team`; `berlin` deletes (204).
- `disables a hook omitted by name`: an instance where `beforeChange` is `(({ uniquePath, ...rest }) => rest)(page.hooks.beforeChange)`; two root `about` pages both return 201.
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t 'page preset'`.

Commit: `test(core): cover page delete and hook omission`

### Task 12: `treeHooks(options)` for other field names

RED

- `src/app.test.ts`, test `treeHooks › works with other field names`:

```ts
const hooks = treeHooks({ title: "name", slug: "handle", parent: "parentCategory", path: "url" });
const cms = defineCms({
  collections: {
    categories: {
      fields: {
        name: { type: "text", required: true },
        handle: { type: "slug", from: "name", parent: "parentCategory", path: "url" },
        parentCategory: { type: "relation", collection: "categories" },
        url: { type: "text", readOnly: true },
      },
      hooks,
    },
  },
  database: { url: ":memory:" },
  secret: "x".repeat(32),
});
const shoes = await cms.create("categories", { name: "Shoes", handle: "" });
const boots = await cms.create("categories", {
  name: "Boots",
  handle: "",
  parentCategory: shoes.id,
});
expect([shoes.url, boots.url]).toEqual(["/shoes", "/shoes/boots"]);
```

- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t treeHooks`. Expected failure: `treeHooks` is not exported with options, so `handle` stays empty (400) and `url` is missing.

GREEN

- `treeHooks({ title = 'title', slug = 'slug', parent = 'parent', path = 'path' } = {})`. Replace every literal field name in the hooks with the option (`data[title]`, `data[slug]`, `{ [path]: ... }`, `where: { [parent]: doc.id }`, `ValidationError({ [slug]: … })`, and so on). Export `treeHooks`.
- Run the test, the full suite and `pnpm --filter integral-cms typecheck`.

Commit: `feat(core): let treeHooks take field names`

### Task 13: `seo` fields and `seoMeta`

RED

- `src/presets.test.ts`:

```ts
import { seoMeta } from "./presets.ts";

it("seoMeta falls back to the title", () => {
  expect(seoMeta({ title: "About", seo: null })).toEqual({
    title: "About",
    description: undefined,
    noindex: false,
  });
  expect(seoMeta({ title: "About", seo: { title: "", description: "D", noindex: true } })).toEqual({
    title: "About",
    description: "D",
    noindex: true,
  });
  expect(seoMeta({ title: "About", seo: { title: "Custom" } }).title).toBe("Custom");
});
```

- `src/app.test.ts`: add `...seo.fields` to the `pages` fixture. Test `page preset › stores seo as sent`: create `about` with `seo: { description: 'D' }`; `cms.findById` has `seo.title` missing or `null`.
- Run: `pnpm --filter integral-cms test -- src/presets.test.ts src/app.test.ts -t seo`. Expected failure: `seo` and `seoMeta` are not exported from `./presets.ts`.

GREEN

- `src/presets.ts`:

```ts
export const seo = {
  fields: {
    seo: {
      type: "group",
      label: "SEO",
      fields: {
        title: { type: "text" },
        description: { type: "textarea" },
        noindex: { type: "boolean", label: "Hide from search engines" },
      },
    },
  } as const satisfies Fields,
};

type SeoDoc = {
  title?: unknown;
  seo?: { title?: string | null; description?: string | null; noindex?: boolean | null } | null;
};

/** `<head>` values for a document with `seo.fields`. Nothing is stored, so the title fallback follows `title`. */
export function seoMeta(doc: SeoDoc) {
  return {
    title: doc.seo?.title || String(doc.title ?? ""),
    description: doc.seo?.description || undefined,
    noindex: doc.seo?.noindex === true,
  };
}
```

- Run the tests, the full suite, and `pnpm --filter integral-cms typecheck`. Check that `src/presets.ts` still fits on one screen (about 60 lines).

Commit: `feat(core): add seo preset and seoMeta`

### Task 14: Astro example

Manual verification. Run `pnpm build:packages` first (no watcher running).

- `examples/astro/collections/pages.ts`: the spec's usage, with `body: { type: 'textarea' }`.
- `examples/astro/integral.config.ts`: `collections: { posts, pages }`.
- `examples/astro/src/pages/[...path].astro`:

```astro
---
import { seoMeta } from 'integral-cms/presets'

export const prerender = false

const path = `/${Astro.params.path ?? ''}`
const page = await Astro.locals.integral.findOne('pages', { where: { path }, populate: false })
if (!page) return new Response('Not found', { status: 404 })
const meta = seoMeta(page)
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>{meta.title}</title>
    {meta.description && <meta name="description" content={meta.description} />}
    {meta.noindex && <meta name="robots" content="noindex" />}
  </head>
  <body>
    <a href="/">← Home</a>
    <h1>{page.title}</h1>
    <p style="white-space: pre-wrap">{page.body}</p>
  </body>
</html>
```

- Coexistence: Astro ranks static and more specific routes first. `index.astro` keeps `/`, `about.astro` keeps `/about`, `posts/[slug]`, `/api/cms/[...path]` and `/admin/[...path]` win over the rest param. A CMS page at `/` or `/about` is shadowed; the smoke test uses `/company`.
- Smoke test (stop stale daemons with `npx astro dev stop`, delete `examples/astro/cms.db` before and after), with `pnpm dev:astro`:

```sh
B=localhost:4321; J=/tmp/jar; H=(-H 'content-type: application/json' -H "origin: http://$B")
curl -s -c $J "${H[@]}" -d '{"name":"Admin","email":"a@b.co","password":"password123"}' $B/api/cms/auth/sign-up/email
curl -s -b $J "${H[@]}" -d '{"title":"Hello","slug":"hello"}' $B/api/cms/collections/posts
P=$(curl -s -b $J "${H[@]}" -d '{"title":"Company","slug":"","seo":{"description":"Who we are"}}' \
  $B/api/cms/collections/pages | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
curl -s -b $J "${H[@]}" -d "{\"title\":\"Our Team\",\"slug\":\"\",\"parent\":\"$P\",\"seo\":{\"noindex\":true}}" $B/api/cms/collections/pages
curl -s $B/company | grep -a -o '<title>[^<]*</title>\|name="description"[^>]*'
curl -s $B/company/our-team | grep -a -o '<title>[^<]*</title>\|name="robots"[^>]*'
curl -s -o /dev/null -w '%{http_code}\n' $B/nope
curl -s "$B/api/cms/collections/pages?path=/company/our-team" | grep -o '"path":"[^"]*"'
curl -s $B/ | grep -a -o Hello
```

Expect: `<title>Company</title>` and the description; `<title>Our Team</title>` and `noindex`; `404`; `"path":"/company/our-team"`; `Hello`.

- Admin check on `localhost:4321/admin`: Pages list shows both; `path` is disabled; a new page's slug follows the title until edited; `Our Team` shows the prefix `/company/`; renaming `Company` to slug `firm` moves `Our Team` to `/firm/our-team`; deleting `Company` shows the 409 message.
- `pnpm --filter example-astro typecheck`.

Commit: `feat(examples): add pages to the astro example`

### Task 15: Nuxt example

- `examples/nuxt/collections/pages.ts` (same file), `integral.config.ts`: `collections: { posts, pages }`.
- `examples/nuxt/app/pages/[...path].vue`:

```vue
<script setup lang="ts">
import { seoMeta } from "integral-cms/presets";

const route = useRoute();
const path = `/${[route.params.path ?? []].flat().join("/")}`;
const { data: page } = await useIntegral().findOne("pages", { where: { path }, populate: false });
if (!page.value)
  throw createError({ statusCode: 404, statusMessage: "Page not found", fatal: true });

const meta = seoMeta(page.value);
useSeoMeta({
  title: meta.title,
  description: meta.description,
  robots: meta.noindex ? "noindex" : undefined,
});
</script>

<template>
  <main v-if="page">
    <NuxtLink to="/">← Home</NuxtLink>
    <h1>{{ page.title }}</h1>
    <p style="white-space: pre-wrap">{{ page.body }}</p>
  </main>
</template>
```

- `seoMeta` runs in the browser bundle too. Bundle check after the production build: `grep -l ZodError .output/public/_nuxt/*.js` prints nothing. It passes because `presets.ts` imports only `./errors.ts` and `./slugify.ts`, which have no imports.
- Coexistence: `/api/cms/**` and `/admin` are Nitro handlers and run before the page renderer. `index.vue` and `posts/[slug].vue` rank above `[...path].vue`.
- Smoke test as in Task 14 with `pnpm dev:nuxt`, `B=localhost:3000`, `examples/nuxt/cms.db`. Also once on the production build (`HOST=127.0.0.1 PORT=3200` and an absolute `NUXT_DATABASE_URL`), because `integral-cms/presets` must resolve from the Nitro output.
- `pnpm --filter example-nuxt typecheck`.

Commit: `feat(examples): add pages to the nuxt example`

### Task 16: TanStack Start example

- `examples/tanstack-start/collections/pages.ts` (same file), `integral.config.ts`: `collections: { posts, pages }`.
- `examples/tanstack-start/src/routes/$.tsx`:

```tsx
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { seoMeta } from "integral-cms/presets";
import cms from "../../integral.config";

const getPage = createServerFn()
  .validator((path: string) => path)
  .handler(async ({ data: path }) => {
    const page = await cms.findOne("pages", { where: { path }, populate: false });
    if (!page) throw notFound();
    return page;
  });

export const Route = createFileRoute("/$")({
  loader: ({ params }) => getPage({ data: `/${params._splat ?? ""}` }),
  head: ({ loaderData: p }) => {
    const m = p && seoMeta(p);
    return {
      meta: [
        { title: m?.title },
        ...(m?.description ? [{ name: "description", content: m.description }] : []),
        ...(m?.noindex ? [{ name: "robots", content: "noindex" }] : []),
      ],
    };
  },
  component: Page,
  notFoundComponent: () => <p>Page not found</p>,
});

function Page() {
  const page = Route.useLoaderData();
  return (
    <main>
      <Link to="/">← Home</Link>
      <h1>{page.title}</h1>
      <p style={{ whiteSpace: "pre-wrap" }}>{page.body}</p>
    </main>
  );
}
```

- Coexistence: `/`, `/posts/$slug`, `/admin/$` and `/api/cms/$` are more specific than `/$`. The dev server regenerates `src/routeTree.gen.ts`; commit it.
- Smoke test as in Task 14 with `pnpm dev:tanstack`, `B=localhost:3100`. HTML is streamed, so `grep -a` (already in the commands). If `/nope` answers 200 with "Page not found", check the body instead of the status and note it.
- Bundle check after `pnpm build`: `grep -l ZodError` over the client output prints nothing, as for Nuxt.
- `pnpm --filter example-tanstack-start typecheck`.

Commit: `feat(examples): add pages to the tanstack start example`

### Task 17: Docs

- `README.md`:
  - New section "Pages and SEO" after "Read content": the spec's usage and customizing snippets, the path rules, the hook table (names and what they do), `treeHooks()` for other field names (including `title`), reading by `path` (`findOne` and `?path=`), `seoMeta()` in `<head>`, the catch-all route per framework in one line each.
  - Field types: add `slug` (`from`, `parent`, `path`, always required, built-in pattern, live fill on new documents, parent path prefix in the admin). `unique: true` for flat collections such as blog posts: `{ type: 'slug', from: 'title', unique: true }`. A tree with another path field name sets `path` on the slug to match `treeHooks({ path })`.
  - Field options: add `readOnly` (admin only: shown disabled; the API and hooks can still write it; hooks that own the value overwrite it).
  - Status: add "Page and SEO preset (`integral-cms/presets`)".
- `CLAUDE.md`:
  - Architecture: exports list gets `./presets`. New bullet: `src/presets.ts` exports `page`, `seo`, `treeHooks`, `seoMeta`; plain field objects, named hook records and one helper, MUST stay readable on one screen. `src/slugify.ts` (`slugify`, `SLUG_PATTERN`): no imports, shared with the admin by relative import like `condition.ts`.
  - Examples: each has `collections/pages.ts` and a catch-all route (`[...path].astro`, `[...path].vue`, `routes/$.tsx`) that reads by `path`; static routes win over it.
  - Design decisions: "Presets are data, not features": no `findByPath`, paths are stored and filtered like any field. The SEO title fallback is computed by `seoMeta()` at render time and never stored. `readOnly` is an admin hint, not an API rule.
- Run `pnpm test` once more (docs only, sanity).

Commit: `docs: describe page and seo preset`

### Task 18: Final verification

1. `pnpm test`: all green.
2. `pnpm typecheck` (no dev watcher running).
3. `pnpm build`.
4. `grep -l 'class ValidationError' packages/core/dist/*.mjs packages/core/dist/*/*.mjs` lists exactly one file. Two copies would make `instanceof` fail and turn the preset's 400s into 500s.
5. Smoke tests from Tasks 14–16 on all three examples, including the old posts check. Delete each `cms.db` before and after.

## Open risks and spec gaps

- **Static routes shadow CMS pages.** `/` and `/about` in the Astro example, `/` in the others, never reach the catch-all. Documented, not solved.
- **`ß` and other letters without an NFKD decomposition** (`ø`, `æ`, `ł`) become `-`. Only `ß` is mapped.
- **Error body shape.** The `fieldErrors` helper reads both `{ errors }` (ValidationError) and `{ error: issues }` (zod). If spec 3 unified them, drop the second branch.
