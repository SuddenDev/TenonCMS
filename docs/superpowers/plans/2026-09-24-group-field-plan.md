# Plan: Group field

Spec: `docs/superpowers/specs/2026-09-24-group-field-design.md`. Runs after the Kysely plan (`2026-09-24-kysely-auth-plan.md`). Specs 2, 3, 5 and 6 build on groups.

All paths are relative to `packages/core` unless noted. Run tests with `pnpm --filter integral-cms test -- <file> -t '<name>'` and types with `pnpm --filter integral-cms typecheck` (`tsc` includes `src/**/*.test.ts`). No build is needed for either.

## Scope check

- No database change. Groups live inside the JSON `data` column of `cms_documents` / `cms_globals`, so no migration and no Kysely query changes. The only DB-adjacent change is the field-name check in `find()`, which runs before the Kysely `sql` filter fragments are built.
- Files touched: `src/schema.ts`, `src/index.ts`, `src/app.ts`, `src/client.ts`, `src/admin/index.d.ts` (one doc comment), `packages/admin/src/components/DocForm.vue`, `FieldInput.vue`, `packages/admin/src/api.ts` (`titleField()`, `isEmpty()`), tests, docs. No new source files.

## Decisions

- One runtime helper, `filterable(fields, key)` in `src/schema.ts`, used by `find()` and `whereFromQuery()`. Two uses today; spec 2 extends it (relations inside groups, `many`).
- One type helper, `FilterKey<F>` in `src/schema.ts`, used by `FindOptions` in `index.ts` and by `find` / `findOne` in `client.ts`, as the spec requires. Otherwise `client.find('posts', { where: { seo: 'x' } })` type-checks and then fails with 400.
- A group key in `where` throws the existing `Unknown field "<key>"` error. Same message, same test regex.
- Admin: one recursive `normalize(fields, value, save)` replaces `empty()` and the save-time cleanup. With `save`, an optional group whose values are all empty becomes `null` (spec). One `isEmpty(value)` in `packages/admin/src/api.ts` decides emptiness for `DocForm.vue` and `FieldInput.vue`.
- The admin's default `titleField()` skips group fields, so a collection whose first field is a group does not list `[object Object]`. One line, see Task 5.

## Tasks

### Task 1: Validate groups

RED
- `src/schema.test.ts`, new `describe('group', ...)`:

```ts
const schema = dataSchema({
  seo: {
    type: 'group',
    fields: {
      title: { type: 'text', required: true },
      meta: { type: 'group', fields: { robots: { type: 'text' } } },
    },
  },
  address: { type: 'group', required: true, fields: { city: { type: 'text' } } },
})

it('validates nested data and strips unknown keys at every depth', () => {
  expect(schema.parse({ seo: { title: 'T', x: 1, meta: { robots: 'noindex', y: 2 } }, address: { city: 'B', z: 3 } }))
    .toEqual({ seo: { title: 'T', meta: { robots: 'noindex' } }, address: { city: 'B' } })
})

it('allows an optional group to be missing or null and skips its required fields then', () => {
  expect(schema.safeParse({ address: {} }).success).toBe(true)
  expect(schema.safeParse({ seo: null, address: {} }).success).toBe(true)
})

it('requires a required group', () => {
  expect(schema.safeParse({}).success).toBe(false)
  expect(schema.safeParse({ address: null }).success).toBe(false)
})

it('checks required and typed fields inside a present group', () => {
  expect(schema.safeParse({ seo: {}, address: {} }).success).toBe(false)
  expect(schema.safeParse({ seo: { title: 'T', meta: { robots: 1 } }, address: {} }).success).toBe(false)
})
```

- `src/app.test.ts`: in `define()`, add to `posts.fields`:

```ts
seo: { type: 'group', label: 'SEO', fields: { title: { type: 'text' }, noindex: { type: 'boolean' } } },
```

  and in `describe('writes')`:

```ts
it('store and read a group', async () => {
  await client.signUp(admin)
  const post = await client.create('posts', { title: 'Hi', seo: { title: 'S', noindex: true, extra: 1 } } as never)
  expect(post.seo).toEqual({ title: 'S', noindex: true })
  expect((await client.findById('posts', post.id)).seo).toEqual({ title: 'S', noindex: true })
})

it('reject invalid group data', async () => {
  await client.signUp(admin)
  expect(await status(client.create('posts', { title: 'Hi', seo: { noindex: 'yes' } } as never))).toBe(400)
})
```

- Run: `pnpm --filter integral-cms test -- src/schema.test.ts src/app.test.ts`. Expected failure: the valid-data tests fail with a Zod issue "expected string, received object", because `fieldSchema()` falls through to `z.string()` for `type: 'group'`; `store and read a group` gets 400. (The reject tests may already pass; that is fine.)

GREEN
- `src/schema.ts`:

```ts
export type Field =
  | ...
  | (Base & { type: 'group'; fields: Fields })

function fieldSchema(field: Field): z.ZodType {
  switch (field.type) {
    ...
    case 'group':
      return dataSchema(field.fields)
    default: ...
  }
}
```

- `dataSchema` already wraps optional fields in `.optional().nullable()`, and `z.object` strips unknown keys, so nesting needs nothing else.
- Run the same command, then `pnpm --filter integral-cms typecheck`. Expect green.

Commit: `feat(core): add group field validation`

### Task 2: Infer nested types

RED
- `src/schema.test.ts`:

```ts
import type { Data, Fields } from './schema.ts'

const fields = {
  seo: { type: 'group', fields: { title: { type: 'text' }, noindex: { type: 'boolean' } } },
  address: { type: 'group', required: true, fields: { geo: { type: 'group', fields: { lat: { type: 'number' } } } } },
} as const satisfies Fields

it('infers nested group types', () => {
  // Type-level only; the function never runs.
  ;(d: Data<typeof fields>) => {
    const title: string | null | undefined = d.seo?.title
    const lat: number | null | undefined = d.address.geo?.lat
    // @ts-expect-error an optional group can be null
    d.seo.title
    // @ts-expect-error `noindex` is a boolean
    const n: string | null | undefined = d.seo?.noindex
  }
})
```

- Run: `pnpm --filter integral-cms typecheck`. Expected failure: `Property 'title' does not exist on type 'string'`, because `FieldValue` maps a group to `string`.

GREEN
- `src/schema.ts`, first branch of `FieldValue`:

```ts
type FieldValue<F extends Field> = F extends { type: 'group'; fields: infer G extends Fields }
  ? Data<G>
  : F extends { type: 'number' } ? number : ...
```

- `Data` and `Doc` pick this up. `client.create` / `update` now accept typed groups, so drop `as never` from the valid case in `store and read a group` except around `extra`.
- Run `pnpm --filter integral-cms typecheck` and `pnpm --filter integral-cms test`. Expect green.

Commit: `feat(core): infer group field types`

### Task 3: Reject group keys in filters

RED
- `src/app.test.ts`, `describe('local API')`:

```ts
it('rejects group keys in where', async () => {
  await expect(cms.find('posts', { where: { seo: null } as never })).rejects.toThrow(/Unknown field/)
})
```

- Add `'?seo=x'` to the `it.each([...])('reject %s')` list in `describe('reads')`.
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t 'group keys|reject'`. Expected failure: `find` resolves to `[]` (the key exists in the schema, `json_extract` just matches nothing), and `?seo=x` returns 200.

GREEN
- `src/schema.ts`:

```ts
/** Whether `where` accepts `key`. Groups are not filterable. */
export function filterable(fields: Fields, key: string) {
  return Object.hasOwn(fields, key) && fields[key].type !== 'group'
}
```

- `src/index.ts`, in `find()`: replace `Object.hasOwn(schema.collections![collection].fields, key)` with `filterable(schema.collections![collection].fields, key)`. The Kysely `sql` filter below it stays as is.
- `src/app.ts`, in `whereFromQuery()`: `if (!filterable(fields, key)) return undefined`.
- Run the same command, then the whole suite. Expect green.

Commit: `fix(core): reject group keys in filters`

### Task 4: Exclude group keys from `where` types

RED
- `src/app.test.ts`, `describe('local API')`:

```ts
it('rejects group keys in where at the type level', () => {
  ;() => {
    // @ts-expect-error `seo` is a group
    cms.find('posts', { where: { seo: null } })
    // @ts-expect-error `seo` is a group
    client.find('posts', { where: { seo: 'x' } })
  }
})
```

- Run: `pnpm --filter integral-cms typecheck`. Expected failure: `Unused '@ts-expect-error' directive` twice.

GREEN
- `src/schema.ts`:

```ts
/** Field keys that `where` accepts. Groups are not filterable. */
export type FilterKey<F extends Fields> = { [K in keyof F]: F[K] extends { type: 'group' } ? never : K }[keyof F]
```

- `src/index.ts` `FindOptions`: `Partial<Record<FilterKey<Collections<T>[K]['fields']>, ...>>`.
- `src/client.ts` `find` and `findOne`: `Partial<Record<FilterKey<Fields<C, K>>, ...>>`.
- Run `pnpm --filter integral-cms typecheck` and `pnpm --filter integral-cms test`. Expect green.

Commit: `feat(core): exclude group keys from where types`

### Task 5: Render groups in the admin

Admin components have no unit tests. Verify manually.

- `packages/admin/src/components/DocForm.vue`: replace `empty()` and the cleanup in `submit()` with one function, used for the initial `data` and for the payload:

```ts
// Groups always render as objects, so their inputs have a model to bind to.
// On save, an optional group with only empty values becomes null, so its required children do not apply.
// Empty strings become null, so cleared optional fields pass validation.
function normalize(fields: Fields, value: Record<string, any> | null | undefined, save = false): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([k, f]) => {
      const v = value?.[k]
      if (f.type === 'group') {
        const g = normalize(f.fields, v, save)
        return [k, save && !f.required && isEmpty(g) ? null : g]
      }
      if (f.type === 'boolean') return [k, v ?? false]
      return [k, v === '' || v === undefined ? null : v]
    }),
  )
}

const data = ref(normalize(props.fields, props.initial))
// in submit(): await props.save(normalize(props.fields, data.value, true) as Data<Fields>)
```

- `packages/admin/src/api.ts`:

```ts
/** A group value is empty when every value is null, '', false, [] or an empty group. */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === '' || value === false) return true
  return typeof value === 'object' && Object.values(value).every(isEmpty)
}
```

  Keep the existing comment that the payload follows the current fields.
- `packages/admin/src/components/FieldInput.vue`, first branch of the template (the SFC refers to itself by file name):

```vue
<fieldset v-if="field.type === 'group'" class="flex flex-col gap-4 rounded border border-gray-200 p-4">
  <legend class="px-1 text-sm font-medium">
    {{ field.label ?? name }}
    <span v-if="field.required" class="text-red-600" aria-hidden="true">*</span>
  </legend>
  <FieldInput
    v-for="(child, key) in field.fields" :key="key" v-model="model[key]" :name="String(key)" :field="child"
    :loose="loose || (!field.required && isEmpty(model))"
  />
</fieldset>
<label v-else-if="field.type === 'boolean'" ...>
```

  New prop `loose?: boolean`: the field sits in an optional group that is empty. Every input binds `:required="field.required && !loose"` instead of `field.required`, and the `*` marker follows the same rule. Custom fields inside a group get the child key as `name` through this recursion; nothing else changes.
- `packages/admin/src/api.ts`, `titleField()`: default to the first non-group field:

```ts
return collection.titleField ?? Object.keys(collection.fields).find((k) => collection.fields[k].type !== 'group')
```

- `src/admin/index.d.ts`, `FieldContext.name` doc: "Field name in the collection, global or group, e.g. `color`."
- Check types: `pnpm -r typecheck` (with no watcher running, `pnpm typecheck`).

Manual verification (dev playground):
1. Temporarily add to `examples/astro/collections/posts.ts`:
   `seo: { type: 'group', label: 'SEO', fields: { title: { type: 'text' }, noindex: { type: 'boolean' }, color: { type: 'custom:color' }, og: { type: 'group', fields: { image: { type: 'text' } } } } }`.
2. `npx astro dev stop` in `examples/astro`, delete `examples/astro/cms.db`, run `pnpm dev:astro`, open `localhost:5173/admin/`, sign up.
3. New post: the SEO fieldset shows with legend "SEO", a nested `og` fieldset, and the color input. Fill some fields, save. In DevTools → Network, the payload has `seo: { title, noindex, color, og: { image } }`, empty ones `null`.
4. Reload the document: values come back. Clear the SEO title and save: `seo.title` is `null`. Clear all SEO fields and save: `seo` is `null`.
5. Create a post through the API without `seo` (smoke-test curl from `CLAUDE.md`), open it in the admin, save: no error, `seo` stays `null`.
6. Temporarily mark the SEO title `required`. With the group empty, the post saves (`seo: null`). Type into another SEO field: the browser now requires the title. Remove `required`.
7. Revert the example change and delete `cms.db`.

Commit: `feat(admin): render group fields as fieldsets`

### Task 6: Docs

- `README.md`, field types line: add `group`, with the `seo` example from the spec and four facts: an optional group reads as `doc.seo?.title`; inner `required` applies only when the group is present; the admin saves an empty optional group as `null`; filters (`where`, query strings) accept top-level non-group fields only.
- `CLAUDE.md`, Architecture, `src/schema.ts` bullet: add "`group` nests `Fields`; `filterable()` / `FilterKey` keep groups out of `where`". Admin bullet: "`FieldInput.vue` renders a group as a `<fieldset>` and recurses; `DocForm.vue` `normalize()` shapes initial data and the payload; an empty optional group saves as `null`".

Commit: `docs: describe group field`

### Task 7: Final verification

1. `pnpm test`: all green.
2. `pnpm typecheck` (no dev watcher running).
3. `git status`: only the files listed in Scope check changed; the example change from Task 5 is reverted.

## Open risks and spec gaps

- **`titleField` naming a group is not rejected.** The spec puts it out of scope. The list then shows `[object Object]`. Task 5 only fixes the default. A `defineCms` check could come with spec 6, which adds config validation.
- **Error text.** A group key in `where` throws `Unknown field "seo"`, which is slightly misleading. Kept to match the spec ("rejected like an unknown field") and the existing test.
- **Recursive `Field` / `Fields` types.** `type Fields = Record<string, Field>` with a `fields: Fields` member relies on TypeScript deferring object-property types. If TS 6 reports a circular reference, turn `Fields` into an interface with an index signature (`interface Fields { [key: string]: Field }`).
