# Plan: Relation and join fields

Spec: `docs/superpowers/specs/2026-09-24-relation-field-design.md` (spec 2). Runs after spec 4 (Kysely, plan `2026-09-24-kysely-auth-plan.md`) and spec 1 (group field).

All paths are relative to `packages/core` unless noted. Commands:

- Tests: `pnpm --filter integral-cms test -- <file> -t '<name>'`. No build needed.
- Types: `pnpm --filter integral-cms typecheck` (`tsc --noEmit`, includes `*.test.ts`). An unused `@ts-expect-error` is an error, so a type test is RED when the line compiles.

## Starting point (assumed)

- `src/db/index.ts` exports `createDb()` returning `Kysely<Database>`, `migrate()`, and the `Database` interface. `data` columns are JSON text; `toDoc(row)` parses them. `:memory:` has one connection, so code inside a transaction MUST use `trx`.
- `src/schema.ts` has `(Base & { type: 'group'; fields: Fields })` in `Field`; `FieldValue` returns `Data<fields>` for a group; `fieldSchema()` returns `dataSchema(field.fields)`; `where` types exclude group keys; `whereFromQuery` rejects group keys.
- Admin: `FieldInput.vue` renders a group as a `<fieldset>`; `DocForm.vue` has one recursive `empty()` / cleanup over `fields`.

## Verified facts

Checked with `@libsql/client` 0.18 and TypeScript 6.0.3 (spike in the session scratchpad, not in the repo).

- `x IN (SELECT value FROM json_each(?))` with one JSON array parameter works. It avoids SQLite's variable limit, so there is no manual batching of `IN (?, ?, …)`. An empty array matches nothing.
- `json_extract(data, '$.seo.image')` reads a relation inside a group. It returns `NULL` for a missing path.
- `EXISTS (SELECT 1 FROM json_each(d.data, ?) WHERE value = ?)` finds `many` references. `json_each` on a missing path yields no rows.
- `FROM cms_documents d, json_each(d.data, ?) j WHERE j.value IN (SELECT value FROM json_each(?))` returns one row per (document, matched id), with `j.value AS ref`. Used for joins over `many` relations.
- The type design below compiles, including self-references (`pages.parent`), groups, joins, a config depth literal, and every `@ts-expect-error` case in Tasks 6–9.
- Without a guard, the same types on the admin's untyped `{ schema: Schema }` fail with `TS2589: Type instantiation is excessively deep`. Task 6 adds the guard.

## Decisions

- **One new file, `src/relations.ts`,** for the runtime: startup checks, write checks, populate, HTTP path parsing, delete effects. Types go into `src/schema.ts`, because `client.ts` MUST import types only. `toDoc` moves to `src/db/index.ts` so both `index.ts` and `relations.ts` use it.
- **One path helper, `relationPaths(fields)`,** returns `{ path: string[]; field }` for every `relation` at the top level and inside groups. Four users: startup checks, write checks, delete scans, join `on` lookup.
- **Errors.** Two classes, both thrown by the local API:
  - 400: `relations.ts` exports `class HttpError extends Error { constructor(public status: 400, public body: object) }`. Spec 3 replaces it with `ValidationError`.
  - 409: `ConflictError` in a new file, `src/errors.ts`, exported from `integral-cms` (spec). The file MUST have no imports, so presets (spec 5) can import errors in browser bundles without zod. Spec 3 adds `ValidationError` to it.
  - `app.ts` gets `api.onError`: `HttpError` → `c.json(body, status)`, `ConflictError` → 409, anything else → Hono's default 500. Bodies use the zod issue shape (`{ error: [{ path, message }] }`), so `CmsError.message` and the admin show the message.
- **Relation checks run in the local API** (`create`, `update`, `setGlobal`), because they need the database. Zod (`dataSchema`) still does shape checks at the HTTP layer.
- **Delete is one recursive function with one write helper,** so spec 3 can swap in the normal operations:
  - `remove(trx, collection, id, visited)` deletes one document and applies the effects of references to it. Cascade calls `remove` again.
  - `writeData(trx, ref, data)` stores a changed `set-null` document or global.
  - Spec 3 replaces the recursive `remove` with `cms.delete` bound to `trx`, and `writeData` with `cms.update` / `cms.setGlobal`. `visited` moves into `context`.

## Type design (target of Tasks 6–9)

In `src/schema.ts`. `Cs` is the collections record. `P` is `false` (ids), a number (hops left), or a populate object.

```ts
type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
type Meta = { id: string; createdAt: string; updatedAt: string };
type Simplify<T> = { [K in keyof T]: T[K] } & {};

type Sub<P, K> = P extends number
  ? P
  : P extends object
    ? K extends keyof P
      ? P[K]
      : false
    : false;
type Next<S> = S extends true ? false : S extends number ? Prev[S] : S;
type Target<Cs, C, P> = C extends keyof Cs
  ? Simplify<Resolve<Cs, Cs[C]["fields"], P> & Meta>
  : never;

type Value<Cs, F, S> = F extends { type: "group"; fields: infer G extends Fields }
  ? Resolve<Cs, G, S extends true ? 1 : S>
  : F extends { type: "relation"; collection: infer C }
    ? S extends false | 0 | undefined
      ? F extends { many: true }
        ? string[]
        : string
      : F extends { many: true }
        ? Target<Cs, C, Next<S>>[]
        : Target<Cs, C, Next<S>>
    : F extends { type: "join"; collection: infer C }
      ? Target<Cs, C, Next<S>>[]
      : FieldValue<F>;

// Joins are absent unless named in a populate object.
type Joins<F, P> = {
  [K in keyof F]: F[K] extends { type: "join" }
    ? P extends object
      ? K extends keyof P
        ? never
        : K
      : K
    : never;
}[keyof F];
type Req<F> = {
  [K in keyof F]: F[K] extends { required: true } | { type: "join" } ? K : never;
}[keyof F];
export type Resolve<Cs, F extends Fields, P> = Simplify<
  { [K in Exclude<keyof F, Req<F> | Joins<F, P>>]?: Value<Cs, F[K], Sub<P, K>> | null } & {
    [K in Exclude<Req<F>, Joins<F, P>>]: Value<Cs, F[K], Sub<P, K>>;
  }
>;

export type Populate<Cs, F extends Fields> = {
  [
    K in keyof F as F[K] extends { type: "group" | "relation" | "join" } ? K : never
  ]?: F[K] extends { type: "group"; fields: infer G extends Fields }
    ? true | Populate<Cs, G>
    : F[K] extends { collection: infer C extends keyof Cs }
      ? true | Populate<Cs, Cs[C]["fields"]>
      : never;
};
// Generic inference skips excess property checks, so extra keys are mapped to `never` at every level.
export type Exact<P, A> = P extends object
  ? { [K in keyof P]: K extends keyof A ? Exact<P[K], Exclude<A[K], true | undefined>> : never }
  : P;
```

Local API signature (Task 6 onward):

```ts
find<K extends keyof Cs & string, const O extends FindOptions<Cs, K> = {}>(
  collection: K,
  options?: O & { populate?: Exact<O['populate'], PopulateArg<Cs, Cs[K]['fields']>> },
): Promise<Read<Cs, K, PopulateOf<O, D>>[]>
// PopulateOf<O, D>: { populate: false } → false; { populate: object } → it; { depth: N } → N; else D.
// D: the config's `populate.depth` literal, else 2.
```

## Test fixture

Added in Task 4 to `src/app.test.ts`. `setup()` takes the instance: `function setup(cms = define('x'.repeat(32)))`, and returns the same `{ cms, fetch, client }`.

```ts
const relational = () =>
  defineCms({
    collections: {
      media: {
        fields: {
          url: { type: "text", required: true },
          usedIn: { type: "join", collection: "posts", on: "seo.image" },
        },
      },
      authors: {
        titleField: "name",
        fields: {
          name: { type: "text", required: true },
          avatar: { type: "relation", collection: "media" },
          posts: { type: "join", collection: "posts", on: "author" },
        },
      },
      tags: {
        fields: {
          name: { type: "text", required: true },
          posts: { type: "join", collection: "posts", on: "tags" },
        },
      },
      posts: {
        fields: {
          title: { type: "text", required: true },
          author: { type: "relation", collection: "authors" },
          tags: { type: "relation", collection: "tags", many: true },
          seo: { type: "group", fields: { image: { type: "relation", collection: "media" } } },
        },
      },
      notes: { fields: { post: { type: "relation", collection: "posts", required: true } } },
      pages: {
        fields: {
          title: { type: "text", required: true },
          parent: { type: "relation", collection: "pages", onDelete: "cascade" },
        },
      },
    },
    globals: {
      site: {
        fields: {
          logo: { type: "relation", collection: "media" },
          featured: { type: "relation", collection: "posts", many: true },
        },
      },
    },
    database: { url: ":memory:" },
    secret: "x".repeat(32),
  });

// Seeds one graph through the local API and returns the ids.
async function seed(cms: ReturnType<typeof relational>) {
  const m = await cms.create("media", { url: "/a.png" });
  const a = await cms.create("authors", { name: "Ann", avatar: m.id });
  const [t1, t2] = [
    await cms.create("tags", { name: "one" }),
    await cms.create("tags", { name: "two" }),
  ];
  const p = await cms.create("posts", {
    title: "Hi",
    author: a.id,
    tags: [t1.id, t2.id],
    seo: { image: m.id },
  });
  return { m, a, t1, t2, p };
}
```

## Tasks

### Task 1: Validate relation values

RED

- `src/schema.test.ts`, new `describe('relation values')`:

```ts
const s = dataSchema({
  author: { type: "relation", collection: "authors" },
  tags: { type: "relation", collection: "tags", many: true },
  lead: { type: "relation", collection: "authors", required: true, many: true },
  posts: { type: "join", collection: "posts", on: "author" },
});
it("accepts ids, keeps order and strips joins", () => {
  expect(s.parse({ author: "a", tags: ["y", "x"], lead: ["a"], posts: ["p"] })).toEqual({
    author: "a",
    tags: ["y", "x"],
    lead: ["a"],
  });
});
it("rejects duplicates, empty ids and an empty required many", () => {
  expect(s.safeParse({ lead: ["a", "a"] }).success).toBe(false);
  expect(s.safeParse({ lead: ["a"], author: "" }).success).toBe(false);
  expect(s.safeParse({ lead: [] }).success).toBe(false);
  expect(s.safeParse({ lead: ["a"], tags: "x" }).success).toBe(false);
});
```

- Run: `pnpm --filter integral-cms test -- src/schema.test.ts -t 'relation values'`. Expected failure: `fieldSchema` falls to `default` (string), so `tags: ['y', 'x']` fails to parse and `posts` is kept.

GREEN

- `src/schema.ts`: add both members to `Field` (types are needed for the test file to compile in `pnpm typecheck` later; Task 2 tests them):

```ts
| (Base & { type: 'relation'; collection: string; many?: boolean; onDelete?: 'set-null' | 'restrict' | 'cascade' })
| { type: 'join'; label?: string; collection: string; on: string; required?: never }
```

- `fieldSchema`: `case 'relation'`:

```ts
const id = z.string().min(1);
if (!field.many) return id;
const ids = z.array(id).refine((a) => new Set(a).size === a.length, "Duplicate id");
return field.required ? ids.min(1) : ids;
```

- `dataSchema`: skip `join` entries (`.filter(([, f]) => f.type !== 'join')`), so zod strips them.
- Run again. Expect pass.

Commit: `feat(core): validate relation field values`

### Task 2: Relation and join in `Data` and `Doc`

RED

- `src/schema.test.ts`, a type-only block. It is never called; `tsc` checks it:

```ts
// Checked by `pnpm typecheck` only.
function writeTypes() {
  const fields = defineCollection({
    fields: {
      author: { type: "relation", collection: "authors", required: true },
      tags: { type: "relation", collection: "tags", many: true },
      posts: { type: "join", collection: "posts", on: "author" },
    },
  }).fields;
  const d: Data<typeof fields> = { author: "a", tags: ["t"] };
  const t: string[] | null | undefined = d.tags;
  // @ts-expect-error joins are not stored
  d.posts;
  // @ts-expect-error a relation is written as ids
  const bad: Data<typeof fields> = { author: { id: "a" } };
  // @ts-expect-error `required` does not apply to joins
  defineCollection({
    fields: { p: { type: "join", collection: "posts", on: "author", required: true } },
  });
}
```

- Run: `pnpm --filter integral-cms typecheck`. Expected failure: `d.posts` compiles (unused `@ts-expect-error`), and `d.tags` is `string`.

GREEN

- `FieldValue`: `F extends { type: 'relation' } ? (F extends { many: true } ? string[] : string)` before the `string` fallback.
- `Data`: add `F[K] extends { type: 'join' } ? never :` to both key filters.
- Run again. Expect pass. Also `pnpm --filter integral-cms test` stays green.

Commit: `feat(core): type relation and join fields`

### Task 3: Startup checks

RED

- `src/app.test.ts`, `describe('relation schema')`, one `it.each` over configs that MUST throw. Build each with `defineCms({ ...config, database: { url: ':memory:' }, secret: '' })` and cast the config `as never`:

| Case                                     | Config (collections unless noted)                                                               | Message matches               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------- |
| unknown target                           | `posts: { fields: { a: { type: 'relation', collection: 'nope' } } }`                            | `/unknown collection "nope"/` |
| join on unknown field                    | `a: { fields: { p: { type: 'join', collection: 'posts', on: 'x' } } }, posts: { fields: {} }`   | `/join "a.p"/`                |
| join on a non-relation                   | `on: 'title'` with `title: { type: 'text' }`                                                    | `/join "a.p"/`                |
| join on a relation to another collection | `posts.author` targets `b`, join lives in `a`                                                   | `/join "a.p"/`                |
| required + set-null                      | `{ type: 'relation', collection: 'a', required: true, onDelete: 'set-null' }`                   | `/set-null/`                  |
| join in a global                         | `globals: { g: { fields: { p: { type: 'join', … } } } }`                                        | `/join/`                      |
| join in a group                          | `g: { type: 'group', fields: { p: { type: 'join', … } } }`                                      | `/join/`                      |
| cascade in a global                      | `globals: { g: { fields: { a: { type: 'relation', collection: 'a', onDelete: 'cascade' } } } }` | `/cascade/`                   |

- Plus one passing case: `relational()` does not throw. And `on: 'seo.image'` resolves (covered by the fixture).
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t 'relation schema'`. Expected failure: nothing throws.

GREEN

- New `src/relations.ts`:

```ts
export function relationPaths(
  fields: Fields,
  prefix: string[] = [],
): { path: string[]; field: RelationField }[] {
  return Object.entries(fields).flatMap(([key, f]) =>
    f.type === "relation"
      ? [{ path: [...prefix, key], field: f }]
      : f.type === "group"
        ? relationPaths(f.fields, [...prefix, key])
        : [],
  );
}

export function checkSchema(schema: Schema) {
  const collections = schema.collections ?? {};
  const fail = (m: string) => {
    throw new Error(`integral-cms: ${m}`);
  };
  const owners = [
    ...Object.entries(collections).map(([n, c]) => ({ n, fields: c.fields, global: false })),
    ...Object.entries(schema.globals ?? {}).map(([n, g]) => ({
      n,
      fields: g.fields,
      global: true,
    })),
  ];
  for (const { n, fields, global } of owners) {
    for (const { path, field } of relationPaths(fields)) {
      if (!Object.hasOwn(collections, field.collection))
        fail(`relation "${n}.${path.join(".")}" targets unknown collection "${field.collection}"`);
      if (field.required && field.onDelete === "set-null")
        fail(`relation "${n}.${path.join(".")}" is required and cannot use onDelete: 'set-null'`);
      if (global && field.onDelete === "cascade")
        fail(`relation "${n}.${path.join(".")}" is in a global and cannot use onDelete: 'cascade'`);
    }
    // walk all fields: a join is allowed only at the top level of a collection
    for (const [key, f] of Object.entries(fields)) {
      if (f.type === "group" && hasJoin(f.fields)) fail(`join inside group "${n}.${key}"`);
      if (f.type !== "join") continue;
      if (global) fail(`join "${n}.${key}" in a global`);
      const source = collections[f.collection]?.fields;
      const target = source && relationPaths(source).find((r) => r.path.join(".") === f.on);
      if (target?.field.collection !== n)
        fail(`join "${n}.${key}" needs "${f.on}" to be a relation to "${n}" in "${f.collection}"`);
    }
  }
}
```

- `hasJoin(fields)` recurses into groups. Keep it inline in `relations.ts`.
- `src/index.ts`: call `checkSchema(schema)` at the top of `defineCms`, before the log line.
- Run again. Expect pass.

Commit: `feat(core): check relation and join fields at startup`

### Task 4: Write checks

RED

- Add the fixture (see Test fixture) and the `setup(cms)` parameter.
- `describe('relation writes')`, with `const { cms, client } = setup(relational())` in a `beforeEach` and `client.signUp(admin)`:
  - `rejects an unknown id`: `client.create('posts', { title: 'x', author: 'nope' })` → 400. Same for `tags: ['nope']`, `seo: { image: 'nope' }`, and `client.setGlobal('site', { logo: 'nope' })`.
  - `rejects an id from another collection`: `author: <a tag id>` → 400.
  - `rejects a self-reference`: create page `p`, `client.update('pages', p.id, { title: 'x', parent: p.id })` → 400; `cms.findById('pages', p.id)` has no `parent`.
  - `returns ids`: `client.create('posts', { title: 'x', author: a.id })` resolves to an object with `author: a.id` (a string).
  - `rejects duplicates over HTTP`: `tags: [t1.id, t1.id]` → 400 (zod from Task 1).
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t 'relation writes'`. Expected failure: unknown ids and self-references return 201/200.

GREEN

- `src/relations.ts`:

```ts
export class HttpError extends Error {
  constructor(
    public status: 400,
    public body: object,
  ) {
    super(JSON.stringify(body));
  }
}

// Every id MUST exist in its target collection. One query per relation field.
export async function checkRefs(
  q: Kysely<Database>,
  fields: Fields,
  data: Record<string, unknown>,
  self?: { collection: string; id: string },
) {
  for (const { path, field } of relationPaths(fields)) {
    const value = at(data, path);
    const ids = value == null ? [] : field.many ? (value as string[]) : [value as string];
    const fail = (message: string) => {
      throw new HttpError(400, { error: [{ path, message }] });
    };
    if (self && field.collection === self.collection && ids.includes(self.id))
      fail("A document cannot reference itself");
    if (!ids.length) continue;
    const found = await q
      .selectFrom("cms_documents")
      .select("id")
      .where("collection", "=", field.collection)
      .where(sql<boolean>`id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`)
      .execute();
    if (found.length !== new Set(ids).size) fail(`Unknown id in "${field.collection}"`);
  }
}
```

- `at(obj, path)` reads a nested value (`path.reduce((o, k) => o?.[k], obj)`), in `relations.ts`.
- `src/index.ts`: `create` calls `checkRefs(q, fields, data)`, `update` calls `checkRefs(q, fields, data, { collection, id })`, `setGlobal` calls `checkRefs(q, globalFields, data)`, each before the write.
- `src/app.ts`: `api.onError((err, c) => err instanceof HttpError ? c.json(err.body, err.status) : c.text('Internal Server Error', 500))`. The existing `500` test (`keep reads working with a short secret`) MUST stay green.
- Run again, then `pnpm --filter integral-cms test`. Expect all green.

Commit: `feat(core): reject unknown and self-referencing relation ids`

### Task 5: Filters

RED

- `describe('relation filters')` on `relational()`:
  - `filters by a single relation`: `cms.find('posts', { where: { author: a.id } })` returns `p`; over HTTP `?author=<a.id>` too.
  - `rejects many relations and joins`: `cms.find('posts', { where: { tags: 'x' } as never })` rejects with `/not filterable/`; `cms.find('authors', { where: { posts: 'x' } as never })` too; HTTP `?tags=x` and `/collections/authors?posts=x` → 400.
- Type check in a never-called function in `app.test.ts` (the `where` type lives in `index.ts`): `// @ts-expect-error many relations are not filterable` above `cms.find('posts', { where: { tags: 'x' } })`.
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t 'relation filters'` and `pnpm --filter integral-cms typecheck`. Expected failure: the `json_extract` filter on `tags` runs and returns `[]`; the type line compiles.

GREEN

- `src/schema.ts`: `export type FilterKeys<F extends Fields> = { [K in keyof F]: F[K] extends { type: 'group' | 'join' } | { many: true } ? never : K }[keyof F]`. Use it in `where` in `index.ts` and `client.ts` (replacing the group exclusion from spec 1).
- `src/index.ts` `find`: after the `Object.hasOwn` check, throw `Field "${key}" is not filterable` for `join` and `many` relations. `src/app.ts` `whereFromQuery`: return `undefined` for the same types.
- Run both commands again. Expect pass.

Commit: `feat(core): filter by single relations only`

### Task 6: Read types: default populate, `populate: false`, untyped schema

Types first, so the runtime tasks after this one typecheck. The runtime still returns ids until Task 10; tests stay green because no test reads a populated value yet.

RED

- `src/schema.test.ts`: a module-level `const cms = defineCms({ ...same collections and globals as the fixture, database: { url: ':memory:' }, secret: '' })` (nothing connects at import time) and a never-called `async function readTypes()`:

```ts
const p = (await cms.find("posts"))[0];
const name: string = p.author!.name;
const url: string | null | undefined = p.author?.avatar?.url;
const t: string = p.tags![0].name;
const img: string | null | undefined = p.seo?.image?.url;
const ids = (await cms.find("posts", { populate: false }))[0];
const aid: string | null | undefined = ids.author;
const one = await cms.findById("posts", "x", { populate: false });
const aid2: string | null | undefined = one?.author;
const a = (await cms.find("authors"))[0];
// @ts-expect-error joins are absent unless named
a.posts;
// @ts-expect-error `populate: false` returns ids
ids.author?.name;
```

- Untyped schema, same block: `const wide = defineCms({ collections: {} as Record<string, Collection>, database, secret: '' }); const w = (await wide.find('x'))[0]; w.anything`.
- Run: `pnpm --filter integral-cms typecheck`. Expected failure: `p.author!.name` does not exist on `string`; `findById` takes no options.

GREEN

- `src/schema.ts`: `Prev`, `Meta`, `Simplify`, `Sub`, `Next`, `Target`, `Value`, `Joins`, `Req`, `Resolve` from the Type design. Plus:

```ts
// An untyped schema (the admin's) reads plain records; the recursive types would not terminate.
type Wide<Cs> = string extends keyof Cs ? true : false;
export type Read<Cs, F extends Fields, P> =
  Wide<Cs> extends true ? Record<string, any> : Resolve<Cs, F, P>;
export type ReadDoc<Cs, F extends Fields, P> = Simplify<Read<Cs, F, P> & Meta>;
export type ReadOptions = { populate?: boolean | object; depth?: number };
export type PopulateOf<O, D extends number> = O extends { populate: false }
  ? false
  : O extends { populate: infer P extends object }
    ? P
    : O extends { depth: infer N extends number }
      ? N
      : D;
```

- `src/index.ts`: `find`, `findOne`, `findById(collection, id, options?)`, `getGlobal(name, options?)` get `const O extends … = {}` and return `ReadDoc<Collections<T>, Fields, PopulateOf<O, 2>>` (globals: `Partial<Read<…>>`, no `Meta`). `FindOptions` gains `populate?: boolean` and `depth?: number` for now; Task 8 narrows `populate`. Runtime ignores both for now.
- `src/app.ts` calls `cms.find(name, { where, limit })` unchanged. If `Cms<Schema>` fights the new generics, check `Wide` first; do not cast.
- Run: `pnpm --filter integral-cms typecheck`, then `pnpm typecheck` from the root, because the admin (`createClient<{ schema: Schema }>`) is the wide case once Task 17 lands. Expect pass.

Commit: `feat(core): type populated reads`

### Task 7: Read types: `depth` and the config default

RED

- `readTypes()`:

```ts
const d1 = (await cms.find("posts", { depth: 1 }))[0];
const av: string | null | undefined = d1.author?.avatar;
const d0 = (await cms.find("posts", { depth: 0 }))[0];
const s: string | null | undefined = d0.author;
const deep = defineCms({
  collections: { pages: { fields: { parent: { type: "relation", collection: "pages" } } } },
  populate: { depth: 3 },
  database,
  secret: "",
});
const pg = (await deep.find("pages"))[0];
const p3: string | null | undefined = pg.parent?.parent?.parent?.parent;
// @ts-expect-error depth 3 ends at the fourth hop
pg.parent?.parent?.parent?.parent?.id;
```

- Run: `pnpm --filter integral-cms typecheck`. Expected failure: `populate` is not a `defineCms` option; `depth: 1` still resolves two hops.

GREEN

- `src/index.ts`:

```ts
export type PopulateConfig = {
  /** Hops resolved by `populate: true`. Default 2. */
  depth?: number;
  /** Limit for HTTP requests. Default 5. The local API has no limit. */
  maxDepth?: number;
};
type DefaultDepth<P extends PopulateConfig> = P["depth"] extends number ? P["depth"] : 2;
```

- `defineCms<const C, const G, const P extends PopulateConfig = {}>`, option `populate?: P`. Return type uses `PopulateOf<O, DefaultDepth<P>>`.
- Expose it: `cms.populate = { depth: config.depth ?? 2, maxDepth: config.maxDepth ?? 5 } as { depth: DefaultDepth<P>; maxDepth: number }`. The client reads the depth type from here (Task 17), `app.ts` reads `maxDepth` (Task 16).
- `checkSchema` gets the config and throws when `depth > maxDepth` (add that case to Task 3's `it.each` now: `/maxDepth/`).
- Run both `typecheck` and the `relation schema` test. Expect pass.

Commit: `feat(core): type populate depth from the config`

### Task 8: Read types: populate objects

RED

- `readTypes()`:

```ts
const o = (await cms.find("posts", { populate: { author: { avatar: true }, tags: true } }))[0];
const u: string | null | undefined = o.author?.avatar?.url;
const img: string | null | undefined = o.seo?.image;
const g = (await cms.find("posts", { populate: { seo: { image: true } } }))[0];
const gu: string | undefined = g.seo?.image?.url;
const g1 = (await cms.find("posts", { populate: { seo: true } }))[0];
const gu1: string | undefined = g1.seo?.image?.url;
// @ts-expect-error unknown key
cms.find("posts", { populate: { autor: true } });
// @ts-expect-error unknown nested key
cms.find("posts", { populate: { author: { avatr: true } } });
// @ts-expect-error scalars cannot be populated
cms.find("posts", { populate: { title: true } });
// @ts-expect-error an extra key next to a valid one
cms.find("posts", { populate: { author: true, nope: true } });
```

- Run: `pnpm --filter integral-cms typecheck`. Expected failure: every `@ts-expect-error` is unused (`populate` is `boolean` or any object).

GREEN

- `src/schema.ts`: `Populate`, `Exact` from the Type design, and `PopulateArg<Cs, F> = Wide<Cs> extends true ? Record<string, unknown> : Populate<Cs, F>`.
- `src/index.ts`: `FindOptions` `populate?: boolean | PopulateArg<…>`; each read method's `options` parameter is `O & { populate?: Exact<O['populate'], PopulateArg<…>> }`.
- Run again. Expect pass.

Commit: `feat(core): check populate objects against the schema`

### Task 9: Read types: joins and globals

RED

- `readTypes()`:

```ts
const j = (await cms.find("authors", { populate: { posts: true } }))[0];
const title: string = j.posts[0].title;
const author: string | null | undefined = j.posts[0].author;
const jj = (await cms.find("authors", { populate: { posts: { tags: true } } }))[0];
const tag: string = jj.posts[0].tags![0].name;
const site = await cms.getGlobal("site");
const logo: string | null | undefined = site.logo?.url;
const siteIds = await cms.getGlobal("site", { populate: false });
const logoId: string | null | undefined = siteIds.logo;
```

- Run: `pnpm --filter integral-cms typecheck`. Expected failure: whatever Tasks 6–8 missed here. If all lines already compile, the task is a regression guard; keep the lines and commit them as a test.

GREEN

- Fix only what fails. Likely spots: `getGlobal` options typing (`Populate` on global fields), `Joins`/`Req` on named joins.

Commit: `test(core): cover join and global read types`

### Task 10: Populate at runtime: default and `populate: false`

RED

- `describe('populate')` on `relational()`, seeded with `seed()`:
  - `resolves relations up to the default depth`: `(await cms.find('posts'))[0]` matches `{ author: { id: a.id, name: 'Ann', avatar: { id: m.id, url: '/a.png' } }, tags: [{ name: 'one' }, { name: 'two' }], seo: { image: { url: '/a.png' } } }`.
  - `returns ids with populate: false`: `{ author: a.id, tags: [t1.id, t2.id], seo: { image: m.id } }`.
  - `resolves a missing target to null and drops it from many`: use a file database (`tmpDb()` and `inspect(url)` from the spec 4 plan), seed, then delete `t2` and `a` with raw SQL (`DELETE FROM cms_documents WHERE id IN (?, ?)`), so no `onDelete` effect runs. `relational(url = ':memory:')` gets the database URL as a parameter for this. `cms.find('posts')` → `author: null`, `tags: [{ name: 'one' }]`.
  - `findById and findOne populate too`.
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t 'populate'`. Expected failure: `author` is a string.

GREEN

- `src/relations.ts`:

```ts
/** `false`: ids. Number: hops left. Object: listed paths only; `true` inside means one hop. */
export type Spec = false | number | { [key: string]: true | Spec };

export async function populate(
  q: Kysely<Database>,
  collections: Record<string, Collection>,
  fields: Fields,
  docs: Record<string, any>[],
  spec: Spec | true,
) {
  if (!spec || !docs.length) return;
  for (const [key, field] of Object.entries(fields)) {
    const sub = typeof spec === "object" ? spec[key] : spec;
    if (!sub) continue;
    if (field.type === "group") {
      await populate(
        q,
        collections,
        field.fields,
        docs.map((d) => d[key]).filter(Boolean),
        sub === true ? 1 : sub,
      );
      continue;
    }
    if (field.type !== "relation" && field.type !== "join") continue;
    if (field.type === "join" && typeof spec !== "object") continue;
    const next = sub === true ? false : typeof sub === "number" ? sub - 1 : sub;
    const target = collections[field.collection].fields;
    if (field.type === "relation") {
      const found = new Map(
        (await byIds(q, field.collection, [...new Set(docs.flatMap((d) => d[key] ?? []))])).map(
          (d) => [d.id, d],
        ),
      );
      await populate(q, collections, target, [...found.values()], next);
      for (const d of docs) {
        if (d[key] == null) continue;
        d[key] = field.many
          ? d[key].map((id: string) => found.get(id)).filter(Boolean)
          : (found.get(d[key]) ?? null);
      }
    }
    // join: Task 13
  }
}

async function byIds(q: Kysely<Database>, collection: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await q
    .selectFrom("cms_documents")
    .selectAll()
    .where("collection", "=", collection)
    .where(sql<boolean>`id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`)
    .execute();
  return rows.map(toDoc);
}
```

- A target shared by several documents is one object, populated once.
- `src/index.ts`: a local `spec(options)` returns `options.populate === false ? false : typeof options.populate === 'object' ? options.populate : (options.depth ?? config.depth)`. `find` and `findById` call `populate(q, collections, fields, docs, spec(options))` after `toDoc`. `findOne` goes through `find`.
- Run again. Expect pass.

Commit: `feat(core): populate relations on read`

### Task 11: Populate at runtime: `depth` and cycles

RED

- `populate › limits hops with depth`: `cms.find('posts', { depth: 1 })` has `author.avatar === m.id`; `depth: 0` has `author === a.id`.
- `populate › ends cycles at the depth limit`: pages `x` and `y`, `x.parent = y`, then `y.parent = x` (allowed: not a self-reference). `cms.findById('pages', x.id, { depth: 3 })`: hop 1 is `y`, hop 2 is `x`, hop 3 is `y` as a document whose `parent` is the id `x.id`. So `parent.parent.parent.parent === x.id`.
- `populate › uses the config depth`: a second `defineCms` with `populate: { depth: 1 }` (same schema, spread from a shared `relationalConfig`) returns `author.avatar` as an id.
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t 'populate'`. Expected failure: only if Task 10's `spec()` misses `depth` or `config.depth`. If it passes, it is a regression guard.

GREEN

- Fix `spec()` if needed. Refactor the fixture into `relationalConfig` + `relational(extra = {})` only if the config test needs it.

Commit: `test(core): cover populate depth and cycles`

### Task 12: Populate at runtime: populate objects

RED

- `populate › resolves only listed paths`: `populate: { author: { avatar: true } }` → `author.avatar.url === '/a.png'`, `tags` stays ids, `seo.image` stays an id.
- `populate › resolves through groups`: `populate: { seo: { image: true } }` → `seo.image.url`; `populate: { seo: true }` → the same.
- `populate › ignores depth with an object`: `{ populate: { author: true }, depth: 5 }` → `author.avatar === m.id`.
- Run. Expected failure: whichever branch of `populate()` is wrong; the object branch was written in Task 10 but not tested.

GREEN

- Fix `populate()` only where a test fails.

Commit: `test(core): cover populate objects and groups`

### Task 13: Joins

RED

- `populate › resolves a named join newest first`: create `p2` for author `a` after `p`. `cms.findById('authors', a.id, { populate: { posts: true } })` → `posts.map((x) => x.id)` is `[p2.id, p.id]`, and `posts[0].author === a.id` (a `populate: false` read).
- `populate › leaves unnamed joins out`: `cms.findById('authors', a.id)` has no `posts` key (`not.toHaveProperty('posts')`).
- `populate › joins over many relations and groups`: `tags` `t2` with `{ posts: true }` → `[p]`; `media` with `{ usedIn: true }` → `[p]`; an author with no posts → `posts: []`.
- `populate › nested paths go through a join`: `{ posts: { tags: true } }` → `posts[0].tags[0].name`.
- Run. Expected failure: `posts` is absent.

GREEN

- In `populate()`, the join branch. One query per join field per hop:

```ts
const source = relationPaths(target).find((r) => r.path.join(".") === field.on)!.field;
const path = `$.${field.on}`;
const ids = JSON.stringify(docs.map((d) => d.id));
const rows = (
  await (
    source.many
      ? sql<
          Row & { ref: string }
        >`SELECT d.*, j.value AS ref FROM cms_documents d, json_each(d.data, ${path}) j
      WHERE d.collection = ${field.collection} AND j.value IN (SELECT value FROM json_each(${ids}))
      ORDER BY d.created_at DESC, d.rowid DESC`
      : sql<
          Row & { ref: string }
        >`SELECT d.*, json_extract(d.data, ${path}) AS ref FROM cms_documents d
      WHERE d.collection = ${field.collection} AND json_extract(d.data, ${path}) IN (SELECT value FROM json_each(${ids}))
      ORDER BY d.created_at DESC, d.rowid DESC`
  ).execute(q)
).rows;
const byId = new Map(rows.map((r) => [r.id, toDoc(r)]));
await populate(q, collections, target, [...byId.values()], next);
for (const d of docs) d[key] = rows.filter((r) => r.ref === d.id).map((r) => byId.get(r.id));
```

- Run again. Expect pass.

Commit: `feat(core): populate join fields`

### Task 14: Globals

RED

- `populate › resolves global relations`: `cms.setGlobal('site', { logo: m.id, featured: [p.id] })`; `cms.getGlobal('site')` → `logo.url === '/a.png'`, `featured[0].author.name === 'Ann'`; `{ populate: false }` → ids.
- Run. Expected failure: `logo` is a string.

GREEN

- `getGlobal`: `const data = row ? JSON.parse(row.data) : {}`, then `populate(q, collections, globalFields, [data], spec(options))`.
- Run again. Expect pass.

Commit: `feat(core): populate relations in globals`

### Task 15: Parse populate from the query string

Pure function, unit tested next to the code.

RED

- New `src/relations.test.ts`, `describe('parsePopulate')`, with the fixture's schema as a plain object (no `defineCms`), `config = { depth: 2, maxDepth: 2 }`:

```ts
const parse = (q: Record<string, string>, name = "posts") =>
  parsePopulate(schema, schema.collections[name].fields, q, config);
expect(parse({})).toEqual(2);
expect(parse({ populate: "false" })).toEqual(false);
expect(parse({ depth: "1" })).toEqual(1);
expect(parse({ populate: "author.avatar,tags" })).toEqual({ author: { avatar: true }, tags: true });
expect(parse({ populate: "author,author.avatar" })).toEqual({ author: { avatar: true } });
expect(parse({ populate: "seo.image" })).toEqual({ seo: { image: true } });
expect(parse({ populate: "seo" })).toEqual({ seo: true });
expect(parse({ populate: "posts.tags" }, "authors")).toEqual({ posts: { tags: true } });
for (const bad of [
  { populate: "title" },
  { populate: "nope" },
  { populate: "author.nope" },
  { populate: "" },
  { depth: "3" },
  { depth: "-1" },
  { depth: "x" },
  { populate: "author.posts.author" },
])
  expect(parse(bad)).toBeUndefined();
```

- Run: `pnpm --filter integral-cms test -- src/relations.test.ts`. Expected failure: `parsePopulate` is not exported.

GREEN

- `src/relations.ts`:

```ts
// Returns `undefined` for an invalid path, an unknown field or too many hops.
export function parsePopulate(
  schema: Schema,
  fields: Fields,
  query: { populate?: string; depth?: string },
  config: { depth: number; maxDepth: number },
): Spec | undefined {
  if (query.depth !== undefined) {
    if (!/^\d+$/.test(query.depth) || Number(query.depth) > config.maxDepth) return undefined;
  }
  if (query.populate === "false") return false;
  if (query.populate === undefined)
    return query.depth === undefined ? config.depth : Number(query.depth);
  const spec: Record<string, any> = {};
  for (const path of query.populate.split(",")) {
    let node = spec;
    let current = fields;
    let hops = 0;
    for (const [i, key] of path.split(".").entries()) {
      const field = Object.hasOwn(current, key) ? current[key] : undefined;
      if (!field || !["group", "relation", "join"].includes(field.type)) return undefined;
      if (field.type !== "group" && ++hops > config.maxDepth) return undefined;
      current =
        field.type === "group" ? field.fields : schema.collections![field.collection].fields;
      if (i === path.split(".").length - 1) node[key] ??= true;
      else node = node[key] = typeof node[key] === "object" ? node[key] : {};
    }
  }
  return spec;
}
```

- `depth` with an object is ignored (spec), but still validated.
- Run again. Expect pass.

Commit: `feat(core): parse populate paths from the query string`

### Task 16: HTTP read routes

RED

- `describe('populate over HTTP')` on `setup(relational())`, raw requests via `cms.fetch(new Request(...))`:
  - `GET /collections/posts` → `author.name === 'Ann'` (default).
  - `?populate=false` → `author === a.id`.
  - `?depth=1` → `author.avatar === m.id`.
  - `?populate=seo.image` → `seo.image.url`, `author` an id. `?populate=seo` → the same.
  - `/collections/authors/<id>?populate=posts` → `posts[0].id === p.id`.
  - `/globals/site?populate=false` → ids.
  - 400 for `?depth=6`, `?populate=title`, `?populate=nope`, and `?populate=author.posts.author.posts.author.posts` (6 hops).
  - `?populate=false&title=Hi` still filters.
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t 'populate over HTTP'`. Expected failure: `populate` is treated as a filter field → 400 on every `?populate=`, and `?depth=6` → 400 for the wrong reason (unknown field). Check the first case fails on the value, not the status.

GREEN

- `src/app.ts`: in all three read routes, take `populate` and `depth` out of the query like `limit` does:

```ts
const { limit, populate, depth, ...query } = c.req.query()
const spec = parsePopulate(schema, fields, { populate, depth }, cms.populate)
if (spec === undefined) return c.json({ error: 'Invalid populate' }, 400)
return c.json(await cms.find(name, { where, limit: …, ...(spec === false ? { populate: false } : typeof spec === 'number' ? { depth: spec } : { populate: spec }) }))
```

- Update the comment above the routes: `limit`, `populate` and `depth` are not filters.
- Run again, then the whole file. Expect green.

Commit: `feat(core): accept populate and depth on HTTP reads`

### Task 17: Client

RED

- `describe('populate over HTTP')`, same fixture, now via `client`:
  - `client.find('posts', { populate: { author: { avatar: true } } })` → `[0].author.avatar.url === '/a.png'`.
  - `client.findById('posts', p.id, { populate: false })` → `author === a.id`.
  - `client.find('posts', { populate: {} })` → ids (serializes to `populate=false`).
  - `client.getGlobal('site', { depth: 0 })` → ids.
- Types, in a never-called function in `app.test.ts` with `client` typed from `relational()`:

```ts
const c = (await client.find("posts"))[0];
const n: string = c.author!.name;
// @ts-expect-error unknown populate key
client.find("posts", { populate: { autor: true } });
const ids = await client.findById("posts", "x", { populate: false });
const aid: string | null | undefined = ids.author;
```

- Run the tests and `pnpm --filter integral-cms typecheck`. Expected failure: the client sends no `populate`, and its types say `author` is a string.

GREEN

- `src/client.ts`:

```ts
type Depth<C> = C extends { populate: { depth: infer D extends number } } ? D : 2;
type Cs<C extends { schema: Schema }> = NonNullable<C["schema"]["collections"]>;

// `{ author: { avatar: true } }` becomes `author.avatar`. An empty object is a path end too.
function paths(p: object, prefix = ""): string[] {
  return Object.entries(p).flatMap(([k, v]) =>
    v === true || (v && typeof v === "object" && !Object.keys(v).length)
      ? [prefix + k]
      : v && typeof v === "object"
        ? paths(v, `${prefix}${k}.`)
        : [],
  );
}
function readQuery(o: { populate?: boolean | object; depth?: number }) {
  const p =
    o.populate === false
      ? "false"
      : typeof o.populate === "object"
        ? paths(o.populate).join(",") || "false"
        : undefined;
  return { populate: p, depth: o.depth };
}
```

- `find`, `findOne`, `findById`, `getGlobal` take `const O` options like the local API and return `ReadDoc<Cs<C>, Fields<C, K>, PopulateOf<O, Depth<C>>>`. `find` merges `readQuery(options)` into its query; `request()` already drops `undefined` values.
- Run both commands again. Then `pnpm typecheck` from the root: the admin's wide client MUST still compile.

Commit: `feat(core): populate reads in the client`

### Task 18: Delete: `set-null`

RED

- `describe('onDelete')` on `relational()` with `seed()`:
  - `set-null clears single, many, grouped and global references`: `cms.setGlobal('site', { logo: m.id, featured: [p.id] })`. `cms.delete('media', m.id)` → `findById('posts', p.id, { populate: false })` has `seo.image === null`; `findById('authors', a.id, …)` has `avatar === null`; `getGlobal('site', { populate: false }).logo === null`. `cms.delete('tags', t1.id)` → `tags` is `[t2.id]`.
  - `set-null updates updatedAt`: the post's `updatedAt` changes.
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t 'onDelete'`. Expected failure: `seo.image` is still `m.id`.

GREEN

- `src/relations.ts`:

```ts
type Ref = {
  collection?: string;
  global?: string;
  id?: string;
  data: Record<string, any>;
  path: string[];
  field: RelationField;
};

// Every document and global that holds `id` in a relation to `collection`. One query per relation field.
async function references(
  q: Kysely<Database>,
  schema: Schema,
  collection: string,
  id: string,
): Promise<Ref[]>;
```

- For each collection and global, for each `relationPaths()` entry whose `field.collection === collection`: single → `json_extract(data, ${path}) = ${id}`; many → `EXISTS (SELECT 1 FROM json_each(data, ${path}) WHERE value = ${id})`. Globals query `cms_globals` the same way.

```ts
export async function remove(
  trx: Kysely<Database>,
  schema: Schema,
  collection: string,
  id: string,
  visited: Set<string>,
) {
  if (visited.has(`${collection}:${id}`)) return;
  visited.add(`${collection}:${id}`);
  const refs = (await references(trx, schema, collection, id)).filter(
    (r) => !r.id || !visited.has(`${r.collection}:${r.id}`),
  );
  // restrict: Task 19, cascade: Task 20
  for (const r of refs) {
    const parent = at(r.data, r.path.slice(0, -1));
    const key = r.path.at(-1)!;
    parent[key] = r.field.many ? parent[key].filter((x: string) => x !== id) : null;
    await writeData(trx, r);
  }
  await trx
    .deleteFrom("cms_documents")
    .where("collection", "=", collection)
    .where("id", "=", id)
    .execute();
}
```

- `writeData(trx, ref)` updates `data` and `updated_at` in `cms_documents` or `cms_globals`.
- `src/index.ts` `delete`: `await (await db()).transaction().execute((trx) => remove(trx, schema, collection, id, new Set()))`.
- Run again, then the whole suite (the missing-target test from Task 10 uses raw SQL, so it is unaffected). Expect green.

Commit: `feat(core): clear references on delete`

### Task 19: Delete: `restrict`

RED

- `onDelete › restrict blocks the delete and changes nothing`: `cms.create('notes', { post: p.id })` (required → restrict by default). Also set `site.featured = [p.id]` (set-null). Over HTTP, `client.delete('posts', p.id)` → 409, `CmsError.body.references` equals `[{ collection: 'notes', id: note.id }]`. After it, `p` exists and `site.featured` still holds `p.id` (the rollback covers set-null writes done before the check).
- `onDelete › explicit restrict`: a `restrict` relation without `required` in a small `defineCms` also blocks. In the same instance, a global `g` with `pin: { type: 'relation', collection: 'posts', onDelete: 'restrict' }` pointing at the post: `references` contains `{ global: 'g' }`.
- `onDelete › restrict throws ConflictError locally`: `cms.delete('posts', p.id)` rejects with `toBeInstanceOf(ConflictError)` and `toMatchObject({ references: [{ collection: 'notes', id: note.id }] })`. Import `ConflictError` from `./index.ts`.
- Run. Expected failure: `ConflictError` is not exported; over HTTP 204, and the note points to a deleted post.

GREEN

- New `src/errors.ts`, no imports:

```ts
// This file MUST stay free of imports. Presets import it in browser bundles, where zod MUST NOT go.
export type Reference = { collection: string; id: string } | { global: string };

/** Thrown when a delete hits `restrict` references. HTTP returns 409 with `references`. */
export class ConflictError extends Error {
  constructor(public references: Reference[]) {
    super("Referenced by other documents");
  }
}
```

- `src/index.ts`: `export { ConflictError } from './errors.ts'`.
- `src/app.ts` `onError`: `err instanceof ConflictError` → `c.json({ error: [{ path: [], message: err.message }], references: err.references }, 409)`.
- In `remove`, before any write:

```ts
const blocking = refs.filter(
  (r) => (r.field.onDelete ?? (r.field.required ? "restrict" : "set-null")) === "restrict",
);
if (blocking.length)
  throw new ConflictError(
    blocking.map((r) =>
      r.global ? { global: r.global } : { collection: r.collection!, id: r.id! },
    ),
  );
```

- The `set-null` loop filters to `set-null` refs only. The throw rolls back the transaction, including effects of outer cascade levels.
- Run again. Expect pass.

Commit: `feat(core): block deletes of restricted references with ConflictError`

### Task 20: Delete: `cascade`

RED

- `onDelete › cascade deletes recursively`: pages `root ← child ← grandchild` (`parent` has `cascade`). `cms.delete('pages', root.id)` → all three gone.
- `onDelete › cascade ends cycles`: `x.parent = y`, `y.parent = x`. `cms.delete('pages', x.id)` resolves and both are gone.
- `onDelete › cascade applies the rules of deleted documents`: a `notes`-like restrict reference to `child` makes deleting `root` return 409 and leaves all three pages in place. Needs a relation to `pages` with restrict: add `pin: { type: 'relation', collection: 'pages', required: true }` to `notes` in the fixture.
- Run. Expected failure: children are left with `parent: null`.

GREEN

- In `remove`, after the restrict check:

```ts
for (const r of refs.filter((r) => r.field.onDelete === "cascade"))
  await remove(trx, schema, r.collection!, r.id!, visited);
```

- Cascade from globals cannot occur (Task 3 check), so `collection` and `id` are set.
- Run again, then `pnpm --filter integral-cms test`. Expect green.

Commit: `feat(core): cascade deletes along relations`

### Task 21: Admin

No unit tests in this repo. Manual check at the end of the task.

Changes in `packages/admin/src`:

- `pages/DocEdit.vue`: `client.findById(name, id, { populate: false })`. After save, `client.update` already returns ids. Below the form, for each `join` field of the collection, a read-only list from `client.findById(name, id, { populate: { [key]: true } })` (one request for all join keys: `Object.fromEntries(joinKeys.map((k) => [k, true]))`). Each item links to `/collections/<field.collection>/<doc.id>` and shows `doc[titleField(target)] || doc.id`. A 409 on delete shows the message (`CmsError.message`) with `alert()` or the existing error style.
- `pages/CollectionList.vue` and `pages/GlobalEdit.vue`: `{ populate: false }`.
- `components/DocForm.vue`: skip `join` fields in the form data and the payload. `empty()` returns `[]` for a `many` relation.
- `components/FieldInput.vue`: for `relation`, load options once per field: `client.find(field.collection, { populate: false })`, labeled by `titleField(schema.value.collections[field.collection])`, falling back to the id. Single: `<select>` with an empty `null` option, like `select`. `many`: `<select multiple>` bound to the array. `join`: render nothing (DocEdit shows it).
- Keep it in these files; no new component until a second use exists.

Example for the manual check, in `examples/astro`:

- New `collections/authors.ts`: `name` (text, required), `posts: { type: 'join', collection: 'posts', on: 'author' }`, `titleField: 'name'`. Register it in `integral.config.ts`.
- `collections/posts.ts`: `author: { type: 'relation', collection: 'authors', label: 'Author' }`.
- The example pages keep working: they print scalar fields only. Check with `pnpm --filter <astro example> typecheck`.

Manual verification (`pnpm build:packages`, then `pnpm dev:astro`, delete `examples/astro/cms.db` first, open `localhost:5173/admin/` so admin changes hot-reload):

1. Create two authors. Create a post, pick an author in the select, save. Reload: the select still shows the author.
2. Open the author: the linked posts list shows the post, newest first; the link opens it.
3. Delete the author: the post's author select is empty (set-null).
4. With a temporary `required: true` on `author` (restart the dev server), deleting a referenced author shows the 409 message, and the author stays.
5. `curl localhost:4321/api/cms/collections/posts` shows the author populated; `?populate=false` shows the id.

Commit: `feat(admin): edit relations and show joins`

### Task 22: Nuxt composable

- `src/nuxt/runtime/composables.ts`: `findById(collection, id, options?)` and `getGlobal(name, options?)` pass options to the client. Every `useAsyncData` key includes `JSON.stringify(options)` (today `findOne` keys only on `where`, so two `findOne` calls with different `populate` would share data).
- The option types come from `Parameters<typeof client.findById<K>>[2]`, like the existing `find`.
- Generic `O` does not survive `Parameters<…>`, so the composable's return type falls back to the default depth. Accept that for now; see Open risks.
- Check: `pnpm build:packages`, then `pnpm --filter <nuxt example> typecheck` (`nuxt typecheck`). No behavior change for the example; its smoke test covers the rest.

Commit: `feat(nuxt): pass populate options through useIntegral`

### Task 23: Docs

- `README.md`:
  - Schema example: `author: { type: 'relation', collection: 'authors' }`, `tags` with `many: true`, and a `join` on `authors`.
  - New section "Relations": field options table from the spec; `populate` and `depth` with the spec's examples; `populate: { depth, maxDepth }` in `defineCms`; HTTP (`?populate=author.avatar,tags`, `?populate=false`, `?depth=`); `onDelete` rules, `ConflictError` and the 409 body (`{ collection, id }` or `{ global }`) and the known cascade gap from the spec; filters only on single top-level relations; the scan ceiling (fine up to roughly 10k–50k documents per collection).
  - Read API: `limit`, `populate` and `depth` are not filters over HTTP.
  - Status: move "Relations between collections" from the roadmap to "Working"; renumber.
- `CLAUDE.md`:
  - Architecture: `src/relations.ts` (startup checks, write checks, `populate()`, `parsePopulate()`, delete effects in one transaction, `HttpError` for 400); `src/errors.ts` (`ConflictError`, no imports, exported from `integral-cms`); read types in `src/schema.ts` (`Resolve`, `Populate`, `Exact`, the `Wide` guard); `cms.populate` exposes the depth config.
  - Design decisions: relation ids live in the document JSON; reverse lookups scan with `json_extract` / `json_each`; id lists go in as one JSON parameter (`IN (SELECT value FROM json_each(?))`), so there is no variable limit.
  - Gotchas: generic inference skips excess property checks, so `populate` objects need `Exact`; recursive read types on the admin's untyped schema hit TS2589 without `Wide`; delete code MUST use `trx` (one connection on `:memory:`).
  - Next up: unchanged unless the roadmap order changed.

Commit: `docs: describe relation and join fields`

### Task 24: Final verification

1. `pnpm test`: all green.
2. `pnpm typecheck` (no dev watcher running).
3. `pnpm build`.
4. Curl smoke test from `CLAUDE.md` on each example (Astro `4321`, Nuxt `3000`, TanStack `3100` with `grep -a`). Delete `cms.db` before and after; stop stale Astro daemons. Expect 200, 201, and `Hello` in the page HTML.
5. Astro only, with the new `authors` collection:

```sh
A=$(curl -s -b $J -H 'content-type: application/json' -H "origin: http://$B" \
  -d '{"name":"Ann"}' $B/api/cms/collections/authors | jq -r .id)
curl -s -b $J -H 'content-type: application/json' -H "origin: http://$B" \
  -d "{\"title\":\"Rel\",\"slug\":\"rel\",\"author\":\"$A\"}" $B/api/cms/collections/posts
curl -s "$B/api/cms/collections/posts?slug=rel" | jq '.[0].author.name'          # "Ann"
curl -s "$B/api/cms/collections/authors/$A?populate=posts" | jq '.posts[0].title' # "Rel"
curl -s -o /dev/null -w '%{http_code}\n' "$B/api/cms/collections/posts?depth=9"  # 400
```

## Open risks and spec gaps

- **Write checks are not in a transaction.** A target deleted between the id check and the write leaves a dangling id, which reads as `null`. Spec 3 wraps writes in a transaction and closes this.
- **Local API writes do not strip `join` keys.** HTTP strips them (zod). A local `create` with a join key stores it, and an unnamed join then leaks that value on read. Strip in the local API if this matters before spec 3.
- **Batching is not asserted by a test.** It holds by construction (one query per field per hop). A query counter would need a hook into `createDb`; add it only if a regression happens.
- **Type limits.** Depth literals above 10 fall off `Prev` and type as `undefined`; the local API allows any depth at runtime. A non-literal `number` depth types like the default depth. The Nuxt composable loses the per-call `populate` type (Task 22). A `populate` object from a variable (not a literal) is checked only structurally.
- **Type cost.** `Resolve` expands per call site. Large schemas with deep `populate` may slow the editor. Measure with `tsc --extendedDiagnostics` on the examples after Task 17.
- **Kysely signatures are from the spec 4 plan, not from code.** If spec 4 lands with other names (`createDb`, `toDoc`, `Database`), adjust the sketches; the queries stay the same.
