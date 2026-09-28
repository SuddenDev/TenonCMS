# Plan: Field options

Spec: `docs/superpowers/specs/2026-09-24-field-options-design.md`. Runs after specs 4 (Kysely), 1 (group), 2 (relation, join, populate) and 3 (hooks, transactions, `ValidationError`). Spec 5 (page preset) builds on it.

All paths are relative to `packages/core` unless noted.

- Runtime tests: `pnpm --filter integral-cms test -- <file> -t '<name>'`. No build needed.
- Type tests (`@ts-expect-error`): `pnpm --filter integral-cms typecheck`. Vitest strips types, so a type test is only RED or GREEN under `tsc`.

## Assumptions about the code after specs 4, 1, 2, 3

The plan names these places by role. If the earlier plans chose other names, use theirs.

- **Write pipeline** (spec 3) in `src/index.ts`: one function that runs `create`, `update` and `setGlobal` inside `db.transaction()` in the order `beforeOperation → beforeValidate → zod → beforeChange → zod again → DB write → …`. It has `operation`, `id`, `originalDoc`, `user`, the transaction-bound `cms` and `trx` in scope. Zod failures and `ValidationError` become HTTP 400 `{ errors: { [path]: message } }`.
- **Startup checks** (spec 2) in `src/index.ts`: a function that walks the schema in `defineCms` and throws (unknown relation target, bad `join`, …).
- **Field walkers** (spec 1): `Field` has a `group` member with `fields: Fields`; `DocForm.vue` has one recursive function for initial values and one for the save cleanup; `FieldInput.vue` renders a group as a `<fieldset>` of child `FieldInput`s.
- **Populate** (spec 2): the local API returns populated relations as documents (or arrays of documents) and populated `join` fields as arrays of documents. The client's result types look up target collections through the `Collections<C>` helper in `src/client.ts`.
- **Field errors in the admin** (spec 3): `DocForm.vue` shows `errors[path]` next to each field.

## Decisions

- **`matchCondition` lives in a new file, `src/condition.ts`, with no imports.** The admin already imports core source files by relative path and Vite bundles them (`packages/admin/src/api.ts` imports `createClient` from `../../core/src/client`). `client.ts` works in the browser because it has no runtime imports. `schema.ts` imports `zod` at runtime, so the evaluator MUST NOT live there, or zod ships in the admin bundle. `schema.ts` imports only the `Condition` type from `condition.ts`. `condition.ts` is not a tsdown entry and not a public export; `index.ts` bundles it.
- **`dataSchema(fields, data?)` takes the input.** Conditions depend on the data, so the validator is built per write. Fields without a condition behave as today, and `dataSchema(fields)` without data keeps working for them. A field whose condition is false keeps its type check but drops `required` and the built-in checks (spec).
- **`pattern` compiles with the `v` flag**, as browsers do for the HTML `pattern` attribute, so admin and server accept the same strings: `new RegExp(`^(?:${pattern})$`, 'v')`. An invalid pattern throws in `defineCms` (it builds the validator once at startup to check). `<textarea>` has no `pattern` attribute; there only the server checks it.
- **Empty values for `exists`**: `null`, missing and `''` count as not existing. The admin keeps `''` in the form until save.
- **Hidden fields survive HTTP updates (spec).** HTTP `PUT` replaces the whole document, and the admin never sees hidden values. The route copies hidden values from the stored document into the input.
- **Group defaults (spec).** On `create`, only children of a group present in the input get defaults. An absent group stays absent.
- **`set-null` updates skip `validate` (spec 3).** The write pipeline takes an internal `effect` flag. `onDeleteEffects` sets it; `runValidate` does not run when it is set. The flag is not part of the public local API.
- **`unique` on `slug` comes with spec 5.** The spec allows `unique` on `slug`, but the type does not exist yet. This plan allows the other types; spec 5 adds `'slug'` to the `unique` list in the startup check (Task 7) and to the `Base.unique` doc comment, with its own tests.
- **Private and hidden are an HTTP concern** in `src/app.ts`. The local API and hooks see everything. One walker, `strip(fields, doc, level)`, removes fields the caller cannot see, recursing into groups, populated relations and joins with the target collection's fields.
- **Reads look up the session only when a cookie is sent.** Reads stay public and keep working with a bad `secret`: a failed lookup counts as no session.

## Tasks

### Task 1: `matchCondition` operators

RED

- `src/schema.test.ts`, `describe('matchCondition')`, test `supports every operator`:

```ts
import { matchCondition } from "./condition.ts";

const d = { type: "video", price: 5, tag: "", date: "2026-09-24" };
it.each([
  [{ type: "video" }, true],
  [{ type: { eq: "image" } }, false],
  [{ type: { ne: "image" } }, true],
  [{ type: { in: ["video", "youtube"] } }, true],
  [{ type: { notIn: ["video"] } }, false],
  [{ price: { gt: 5 } }, false],
  [{ price: { gte: 5 } }, true],
  [{ price: { lt: 10, gt: 0 } }, true],
  [{ date: { lte: "2026-12-31" } }, true],
  [{ missing: { gt: 0 } }, false],
  [{ tag: { exists: false } }, true],
  [{ missing: null }, true],
  [{ type: "video", price: 6 }, false],
])("%j → %s", (c, expected) => expect(matchCondition(c, d)).toBe(expected));
```

- Run: `pnpm --filter integral-cms test -- src/schema.test.ts -t matchCondition`. Expected failure: `./condition.ts` does not exist.

GREEN

- New `src/condition.ts`:

```ts
export type ConditionValue = string | number | boolean | null;
export type Operators = {
  eq?: ConditionValue;
  ne?: ConditionValue;
  in?: readonly ConditionValue[];
  notIn?: readonly ConditionValue[];
  gt?: number | string;
  gte?: number | string;
  lt?: number | string;
  lte?: number | string;
  exists?: boolean;
};
/** Keys are field paths; `$every` and `$some` take lists of conditions. */
export type Condition = {
  [path: string]: ConditionValue | Operators | readonly Condition[] | undefined;
};

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function test(value: unknown, ops: Operators) {
  const v = value ?? null;
  const comparable = (a: unknown) => v !== null && typeof v === typeof a;
  return Object.entries(ops).every(([op, a]) => {
    switch (op) {
      case "eq":
        return v === a;
      case "ne":
        return v !== a;
      case "in":
        return (a as unknown[]).includes(v);
      case "notIn":
        return !(a as unknown[]).includes(v);
      case "gt":
        return comparable(a) && (v as number) > (a as number);
      case "gte":
        return comparable(a) && (v as number) >= (a as number);
      case "lt":
        return comparable(a) && (v as number) < (a as number);
      case "lte":
        return comparable(a) && (v as number) <= (a as number);
      case "exists":
        return (v !== null && v !== "") === a;
      default:
        return false;
    }
  });
}

/** Core and admin MUST both use this function, so they agree on which fields apply. */
export function matchCondition(
  condition: Condition,
  data: unknown,
  siblingData: unknown = data,
): boolean {
  return Object.entries(condition).every(
    ([key, c]) =>
      c === undefined || test(get(siblingData, key), isObject(c) ? c : { eq: c as ConditionValue }),
  );
}

function get(data: unknown, path: string) {
  return path.split(".").reduce<unknown>((v, k) => (isObject(v) ? v[k] : undefined), data);
}
```

- Run again. Expect pass.

Commit: `feat(core): add condition evaluator`

### Task 2: `$every`, `$some`, sibling and root paths

RED

- Same describe, tests:
  - `nests $every and $some`: `{ $some: [{ type: 'video' }, { $every: [{ type: 'image' }, { price: { gt: 0 } }] }] }` against a few data objects.
  - `reads siblings inside a group and root paths with /`:

```ts
const data = { mode: "advanced", settings: { mode: "simple", color: "red" } };
expect(matchCondition({ mode: "simple" }, data, data.settings)).toBe(true);
expect(matchCondition({ "/mode": "advanced" }, data, data.settings)).toBe(true);
expect(matchCondition({ "/settings.color": "red" }, data, data.settings)).toBe(true);
```

- Run: `pnpm --filter integral-cms test -- src/schema.test.ts -t matchCondition`. Expected failure: `$some` is read as a field named `$some`, and `/mode` as a field named `/mode`.

GREEN

- In `matchCondition`:

```ts
if (key === "$every") return (c as Condition[]).every((x) => matchCondition(x, data, siblingData));
if (key === "$some") return (c as Condition[]).some((x) => matchCondition(x, data, siblingData));
const value = key.startsWith("/") ? get(data, key.slice(1)) : get(siblingData, key);
```

- Run again. Expect pass.

Commit: `feat(core): support nested and root conditions`

### Task 3: Option types

RED

- `src/schema.test.ts`, test `types field options per field type` (type test, body never runs):

```ts
defineCollection({
  fields: {
    a: {
      type: "text",
      minLength: 1,
      maxLength: 9,
      pattern: "[a-z]+",
      placeholder: "x",
      description: "Help",
      default: "x",
      condition: { b: { gt: 0 } },
      unique: true,
      private: true,
      validate: (v) => v !== "no" || "Not allowed",
    },
    b: { type: "number", min: 0, max: 9, default: ({ user }) => (user ? 1 : 0) },
    // @ts-expect-error `min` is for numbers
    c: { type: "text", min: 1 },
    // @ts-expect-error `pattern` is for text
    d: { type: "number", pattern: "1" },
    // @ts-expect-error a RegExp cannot reach the admin
    e: { type: "text", pattern: /x/ },
    // @ts-expect-error `placeholder` is not for booleans
    f: { type: "boolean", placeholder: "x" },
  },
});
```

- Run: `pnpm --filter integral-cms typecheck`. Expected failure: unknown properties `minLength`, `description`, … and unused `@ts-expect-error` directives.

GREEN

- `src/schema.ts`:

```ts
import type { Condition } from "./condition.ts";

type Base = {
  label?: string;
  /** Help text below the input. */
  description?: string;
  required?: boolean;
  /** Used on `create` when the value is `undefined`. A function runs on the server only. */
  default?:
    | string
    | number
    | boolean
    | null
    | readonly string[]
    | ((args: { user: User | null; cms: HookCms }) => unknown);
  /** Server only. Return `true` or an error message. Runs after type checks, before `beforeChange`. */
  validate?: (value: any, args: ValidateArgs) => true | string | Promise<true | string>;
  /** The field applies only when this matches. See `matchCondition`. */
  condition?: Condition;
  /** Top-level `text`, `textarea`, `number`, `date`, `select` and single `relation` fields only. Spec 5 adds `slug`. */
  unique?: boolean;
  /** Sent over HTTP only with a session. */
  private?: boolean;
  /** Never sent over HTTP. Only the local API and hooks see it. */
  hidden?: boolean;
};
type Text =
  | {
      placeholder?: string;
      minLength?: number;
      maxLength?: number;
      /** Whole-value match, no slashes or flags. */ pattern?: string;
    }
  | (Base & Text & { type: "text" | "textarea" })
  | (Base & { type: "date"; placeholder?: string })
  | (Base & { type: "number"; placeholder?: string; min?: number; max?: number });
```

- Split `date` out of the `text | textarea | date` member. `User`, `HookCms` and the field hook argument type come from spec 3; `ValidateArgs` is spec 3's field hook argument type (`data`, `siblingData`, `originalDoc`, `operation`, `path`, `cms`, `user`) without `value`.
- `join` (spec 2) does not take `default` or `validate`: give it `Omit<Base, 'default' | 'validate' | 'required' | 'unique'>` if it uses `Base`.
- Run the typecheck again. Expect pass.

Commit: `feat(core): add field option types`

### Task 4: Built-in validation

RED

- `src/schema.test.ts`, `describe('dataSchema')`, test `checks length, pattern and range, but not empty optional values`:

```ts
const s = dataSchema({
  slug: { type: "text", minLength: 2, maxLength: 4, pattern: "[a-z]+" },
  n: { type: "number", min: 1, max: 3 },
  body: { type: "textarea", minLength: 5 },
});
expect(s.safeParse({ slug: "abc", n: 2 }).success).toBe(true);
expect(s.safeParse({ slug: "", n: null, body: "" }).success).toBe(true);
for (const bad of [
  { slug: "a" },
  { slug: "abcde" },
  { slug: "ab1" },
  { slug: "xab!" },
  { n: 0 },
  { n: 4 },
  { body: "abc" },
])
  expect(s.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
```

- Test `matches the whole value`: `pattern: 'a|b'` rejects `'ab'`.
- Test `rejects an invalid pattern`: `expect(() => dataSchema({ x: { type: 'text', pattern: '(' } })).toThrow()`.
- Run: `pnpm --filter integral-cms test -- src/schema.test.ts -t dataSchema`. Expected failure: the bad values pass, because `fieldSchema` ignores the options.

GREEN

- `fieldSchema(field)`:

```ts
case 'number': {
  let s = z.number()
  if (field.min !== undefined) s = s.min(field.min)
  if (field.max !== undefined) s = s.max(field.max)
  return s
}
case 'text':
case 'textarea': {
  let s = z.string().min(Math.max(field.minLength ?? 0, field.required ? 1 : 0))
  if (field.maxLength !== undefined) s = s.max(field.maxLength)
  // Browsers compile the HTML `pattern` attribute with the `v` flag. The server MUST match them.
  if (field.pattern !== undefined) s = s.regex(new RegExp(`^(?:${field.pattern})$`, 'v'))
  return field.required ? s : z.literal('').or(s)
}
```

- `custom:*` keeps today's `default` branch.
- Run again. Expect pass. Run `pnpm --filter integral-cms test` for the whole suite.

Commit: `feat(core): validate length, pattern and range`

### Task 5: Condition-aware validation in `dataSchema`

RED

- `src/schema.test.ts`, test `skips required and checks for fields whose condition is false, but keeps type checks`:

```ts
const fields = {
  mediaType: { type: "select", options: ["image", "youtube"] },
  url: { type: "text", required: true, pattern: "https://.+", condition: { mediaType: "youtube" } },
  settings: {
    type: "group",
    fields: {
      mode: { type: "text" },
      extra: { type: "text", required: true, condition: { "/mediaType": "youtube" } },
    },
  },
} as const satisfies Fields;
const parse = (d: object) => dataSchema(fields, d).safeParse(d);
expect(parse({ mediaType: "image", settings: {} }).success).toBe(true);
expect(parse({ mediaType: "image", url: "nope", settings: {} })).toMatchObject({
  success: true,
  data: { url: "nope" },
});
expect(parse({ mediaType: "image", url: 5 }).success).toBe(false);
expect(parse({ mediaType: "youtube", url: "nope", settings: { extra: "x" } }).success).toBe(false);
expect(parse({ mediaType: "youtube", url: "https://y.t", settings: {} }).success).toBe(false);
```

- Run: `pnpm --filter integral-cms test -- src/schema.test.ts -t 'condition is false'`. Expected failure: `url` is required even when `mediaType` is `image`.

GREEN

- `src/schema.ts`:

```ts
/**
 * Builds the validator for `data`. Unknown keys are stripped.
 * A field whose `condition` is false keeps its type check, but `required` and the built-in checks are skipped.
 */
export function dataSchema(
  fields: Fields,
  data: unknown = {},
  root = data,
  active = true,
): z.ZodObject {
  const siblings = isObject(data) ? data : {};
  return z.object(
    Object.fromEntries(
      Object.entries(fields).map(([name, field]) => {
        const on = active && (!field.condition || matchCondition(field.condition, root, siblings));
        const s =
          field.type === "group"
            ? dataSchema(field.fields, siblings[name], root, on)
            : fieldSchema(on ? field : loose(field));
        return [name, on && field.required ? s : s.optional().nullable()];
      }),
    ),
  );
}

// Same type check, no `required` and no built-in checks.
const loose = (f: Field) =>
  ({
    ...f,
    required: false,
    minLength: undefined,
    maxLength: undefined,
    pattern: undefined,
    min: undefined,
    max: undefined,
  }) as Field;
```

- `matchCondition` and `isObject` come from `./condition.ts`. This is the first runtime import of `condition.ts` in `schema.ts`; the admin still does not import `schema.ts` at runtime.
- In the startup checks, call `dataSchema(fields)` once per collection and global, so an invalid `pattern` throws in `defineCms`. If `app.ts` still precomputes `validators`, delete that map; validation runs in the write pipeline.
- Run the schema tests. Expect pass.

Commit: `feat(core): skip checks for fields whose condition is false`

### Task 6: Conditions in the write pipeline

RED

- `src/app.test.ts`, `describe('condition')`, with a `media` collection (`mediaType` select, `url` required with condition `{ mediaType: 'youtube' }`). Tests:
  - `lets a required field be missing while its condition is false`: `client.create('media', { mediaType: 'image' })` resolves.
  - `keeps values of fields whose condition is false`: create with `{ mediaType: 'image', url: 'x' }`, `findById` has `url: 'x'`.
  - `checks the field again after beforeChange`: a collection `beforeChange` hook sets `mediaType: 'youtube'` and removes `url`; create returns 400 on `url`.
  - `keeps the type check while the condition is false`: `client.create('media', { mediaType: 'image', url: 5 } as never)` → 400 on `url`.
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t condition`. Expected failure: 400 on `url`, because the pipeline builds the validator without data.

GREEN

- In the write pipeline, both zod passes call `dataSchema(fields, input).safeParse(input)`, with the input of that stage.
- Run again, then the whole suite. Expect pass.

Commit: `feat(core): apply conditions when validating writes`

### Task 7: Startup checks

RED

- `src/schema.test.ts`, `describe('defineCms checks')`. A helper `define(collections, globals?)` calls `defineCms` with `:memory:` and a 32-character secret (nothing connects). Tests:
  - `throws for a condition on an unknown field`: `{ a: { type: 'text', condition: { nope: 1 } } }`, also with `'/g.nope'`, a nested `$some`, and a sibling key inside a group that only exists at the root. Each: `toThrow(/unknown field "nope"/)`.
  - `throws for a condition on a hidden field`: `{ t: { type: 'text', hidden: true }, a: { type: 'text', condition: { t: 'x' } } }` → `toThrow(/hidden field "t"/)`. Same with `'/g.t'` where `t` is hidden inside group `g`.
  - `throws for unique inside a group, in a global, on boolean, custom, group, join and many relations`.
  - `accepts unique on top-level text, textarea, number, date, select and single relation fields`. Spec 5 extends this test with `slug`.
  - `throws for an invalid pattern`.
- Run: `pnpm --filter integral-cms test -- src/schema.test.ts -t 'defineCms checks'`. Expected failure: `defineCms` does not throw.

GREEN

- In the startup checks, one walker over every collection and global:

```ts
const unique = ["text", "textarea", "number", "date", "select", "relation"];

function checkFields(fields: Fields, root: Fields, where: string, top: boolean, global: boolean) {
  for (const [name, f] of Object.entries(fields)) {
    if (f.unique && (global || !top || !unique.includes(f.type) || ("many" in f && f.many)))
      throw new Error(`integral-cms: "${where}.${name}" cannot be unique`);
    for (const key of conditionKeys(f.condition ?? {})) {
      const target = key.startsWith("/") ? fieldAt(root, key.slice(1)) : fieldAt(fields, key);
      if (!target)
        throw new Error(
          `integral-cms: condition on "${where}.${name}" names unknown field "${key}"`,
        );
      if (target.hidden)
        throw new Error(
          `integral-cms: condition on "${where}.${name}" names hidden field "${key}"`,
        );
    }
    if (f.type === "group") checkFields(f.fields, root, `${where}.${name}`, false, global);
  }
}

// Returns undefined for a missing field, or a path through a non-group or a hidden group.
function fieldAt(fields: Fields, path: string): Field | undefined;
function conditionKeys(c: Condition): string[]; // recurses into $every and $some
```

- Run again. Expect pass.

Commit: `feat(core): check conditions and unique at startup`

### Task 8: `default`

RED

- `src/app.test.ts`, `describe('default')`, collection `items`: `status` select with `default: 'draft'`, `owner` text with `default: ({ user }) => user?.email ?? 'system'`, `meta` group with child `lang` text `default: 'en'`. Tests:
  - `fills undefined fields on create`: HTTP create `{}` with a session → `status: 'draft'`, `owner: 'a@b.co'`; local API create → `owner: 'system'`.
  - `fills group children when the group is sent`: create `{ meta: {} }` → `meta.lang === 'en'`.
  - `leaves an absent group absent`: create `{}` → `meta` is missing.
  - `does not replace null`: create `{ status: null }` → `status` is `null`.
  - `does not apply on update`: create, then update with `{}` → `status` missing.
  - `runs before beforeValidate`: a `beforeValidate` hook records `data.status`; it sees `'draft'`.
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t default`. Expected failure: `status` is missing.

GREEN

- `src/index.ts`, called in the write pipeline after `beforeOperation`, for `create` only:

```ts
async function withDefaults(fields: Fields, data: Record<string, unknown>, args: DefaultArgs) {
  const out = { ...data };
  for (const [k, f] of Object.entries(fields)) {
    if (out[k] === undefined && f.default !== undefined)
      out[k] = typeof f.default === "function" ? await f.default(args) : structuredClone(f.default);
    if (f.type === "group" && isObject(out[k])) out[k] = await withDefaults(f.fields, out[k], args);
  }
  return out;
}
```

- Run again. Expect pass.

Commit: `feat(core): apply field defaults on create`

### Task 9: `validate`

RED

- `src/app.test.ts`, `describe('validate')`, collection `events`: `start` date, `end` date with `validate: (v, { siblingData }) => !v || v >= siblingData.start || 'Ends before start'`, `code` text with `validate: (v) => v !== 'x' || 'Not allowed'`, `seo` group with child `title` `validate: (v, { path }) => (calls.push(path), true)`, `url` text with `condition: { kind: 'link' }` and a `validate` that always fails. Tests:
  - `collects all messages in one 400`: create `{ start: '2026-02-01', end: '2026-01-01', code: 'x' }` → 400 with `errors: { end: 'Ends before start', code: 'Not allowed' }`.
  - `passes the path of group children`: `calls` contains `'seo.title'`.
  - `skips fields whose condition is false`: create without `kind` → 201.
  - `runs before beforeChange`: a `beforeChange` hook is not called when `validate` fails.
  - `is skipped on set-null updates`: collections `owners` and `things`; `things.owner` relation to `owners` (set-null by default) and `things.code` text with `validate: (v, { operation }) => operation === 'create' || 'Locked'`. Create an owner and a thing, then `cms.delete('owners', id)` resolves and the thing has `owner: null`. A direct `cms.update('things', …)` still returns 400.
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t validate`. Expected failure: 201 instead of 400, and the delete rejects with `Locked` once `validate` runs.

GREEN

- `src/index.ts`, called after the first zod pass, before `beforeChange`:

```ts
async function runValidate(
  fields: Fields,
  sibling: Record<string, unknown>,
  path: string,
  args: ValidateArgs,
  errors: Record<string, string>,
) {
  for (const [k, f] of Object.entries(fields)) {
    if (f.condition && !matchCondition(f.condition, args.data, sibling)) continue;
    const p = path ? `${path}.${k}` : k;
    const result = await f.validate?.(sibling[k], { ...args, siblingData: sibling, path: p });
    if (typeof result === "string") errors[p] = result;
    if (f.type === "group" && isObject(sibling[k]))
      await runValidate(f.fields, sibling[k], p, args, errors);
  }
}
// in the pipeline:
const errors = {};
await runValidate(fields, data, "", { data, originalDoc, operation, cms, user }, errors);
if (Object.keys(errors).length) throw new ValidationError(errors);
```

- The second zod pass after `beforeChange` does not call `runValidate`.
- `effect` flag: the internal update operation that `bind()` wraps as `cms.update` / `cms.setGlobal` takes `{ effect?: true }` and passes it to the write pipeline, which skips `runValidate` when it is set. `onDeleteEffects` (spec 3, Task 15) calls these internal operations with `{ effect: true }` instead of `s.cms.update` / `s.cms.setGlobal`. Hooks still run.
- Run again. Expect pass.

Commit: `feat(core): run field validate functions`

### Task 10: `unique`

RED

- `src/app.test.ts`, `describe('unique')`, collection `tags`: `slug` text `unique: true`, `rank` number `unique: true`, a `beforeChange` hook that sets `slug` from `data.name` when `data.name` is set. Tests:
  - `rejects a used value`: two creates with `slug: 'a'` → the second is 400 with `errors: { slug: 'Already used' }`. Same for `rank: 1`.
  - `is case-sensitive`: `slug: 'A'` after `'a'` passes.
  - `never matches null or missing`: two creates without `slug` pass; two with `slug: null` pass.
  - `lets a document keep its own value`: update the document with its own `slug` → 200.
  - `checks values set by beforeChange`: create `{ name: 'a' }` after `slug: 'a'` exists → 400 on `slug`.
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t unique`. Expected failure: the second create returns 201.

GREEN

- `src/index.ts`, in the write pipeline after the second zod pass, before the DB write, on the transaction:

```ts
// ponytail: one scan per unique field per write. Add SQLite expression indexes if collections grow large.
async function checkUnique(
  trx: Kysely<Database>,
  collection: string,
  fields: Fields,
  data: Record<string, unknown>,
  id?: string,
) {
  const errors: Record<string, string> = {};
  for (const [k, f] of Object.entries(fields)) {
    if (!f.unique || data[k] == null) continue;
    let q = trx
      .selectFrom("cms_documents")
      .select("id")
      .where("collection", "=", collection)
      .where(sql`json_extract(data, ${`$.${k}`})`, "=", data[k]);
    if (id) q = q.where("id", "!=", id);
    if (await q.executeTakeFirst()) errors[k] = "Already used";
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
}
```

- `k` comes from the schema, never from input. Globals skip this step.
- Run again. Expect pass.

Commit: `feat(core): enforce unique fields`

### Task 11: `hidden`

RED

- `src/app.test.ts`, `describe('hidden')`, collection `users` with `name` text, `token` text `hidden: true`, and `profile` group with child `note` text `hidden: true`. Tests:
  - `is readable and writable through the local API`: `cms.create('users', { name: 'A', token: 't', profile: { note: 'n' } })` → `findById` has both.
  - `is never sent over HTTP`: with and without a session, `client.findById` and `client.find` have no `token` and no `profile.note`.
  - `is ignored in HTTP input`: HTTP create with `token: 'x'` → local `findById` has no `token`.
  - `survives an HTTP update`: local create with `token: 't'`, HTTP update `{ name: 'B', profile: {} }` → local `findById` has `token: 't'` and `profile.note: 'n'`.
  - `cannot be filtered over HTTP`: `GET /collections/users?token=t` → 400, with and without a session.
  - `is missing in /schema`: `client.getSchema()` has no `users.fields.token` and no `profile.fields.note`.
  - `is missing in populated documents`: a `posts` collection with `author` relation to `users`; `client.findById('posts', id)` → `author` has no `token`.
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t hidden`. Expected failure: `token` is in the response.

GREEN

- `src/app.ts`:

```ts
type Level = "public" | "admin";
const visible = (f: Field, level: Level) => !f.hidden && (level === "admin" || !f.private);

// Removes fields the caller cannot see, also in groups, populated relations and joins.
function strip(fields: Fields, doc: unknown, level: Level): unknown {
  if (Array.isArray(doc)) return doc.map((d) => strip(fields, d, level));
  if (!isObject(doc)) return doc;
  const out = { ...doc };
  for (const [k, f] of Object.entries(fields)) {
    if (!visible(f, level)) delete out[k];
    else if (f.type === "group") out[k] = strip(f.fields, out[k], level);
    else if (f.type === "relation" || f.type === "join")
      out[k] = strip(schema.collections![f.collection].fields, out[k], level);
  }
  return out;
}

// HTTP input MUST NOT change hidden fields, and a replace MUST NOT erase them.
function keepHidden(fields: Fields, input: unknown, stored: unknown): unknown {
  if (!isObject(input)) return input;
  const out = { ...input };
  for (const [k, f] of Object.entries(fields)) {
    if (f.hidden) out[k] = isObject(stored) ? stored[k] : undefined;
    else if (f.type === "group")
      out[k] = keepHidden(f.fields, out[k], isObject(stored) ? stored[k] : undefined);
  }
  return out;
}
```

- Read routes return `strip(fields, result, 'public')` for now (Task 12 adds the session).
- `POST`: `keepHidden(fields, body, undefined)`. `PUT /collections/:name/:id`: read the stored document with `findById(name, id, { populate: false })` first, then `keepHidden(fields, body, stored)`. `PUT /globals/:name`: same with `getGlobal`. Write responses go through `strip(…, 'admin')`.
- `whereFromQuery(fields, query, level)`: a field that is not `visible` returns `undefined` (400).
- `/schema`: `publicSchema(schema)` maps collections and globals, removes hidden fields recursively from `fields`.
- Add a comment above the `PUT` read: `// ponytail: read outside the write transaction; a local write to a hidden field in between is lost. Move into the pipeline if that matters.`
- Run again, then the whole suite. Expect pass.

Commit: `feat(core): keep hidden fields out of the HTTP API`

### Task 12: `private`

RED

- `src/app.test.ts`, `describe('private')`, collection `people` with `name` text and `email` text `private: true`, and `posts.author` relation to `people`. Tests:
  - `is missing on public reads`: `find`, `findById`, `findOne` without a session have no `email`.
  - `is sent with a session`: after `signUp`, `findById` has `email`.
  - `cannot be filtered without a session`: `GET /collections/people?email=x` → 400; with a session → 200.
  - `is missing in populated documents on public reads`: `findById('posts', id)` → `author` has no `email`.
  - `keeps reads working with a short secret` (existing test in `errors`) stays green; add a request with a cookie header to it: still 200.
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t private`. Expected failure: with a session, `email` is missing, because reads always use `'public'`.

GREEN

- `src/app.ts`:

```ts
// Reads are public. Only a request with a cookie can see private fields.
async function readLevel(c: Context): Promise<Level> {
  if (!c.req.header("cookie")) return "public";
  const session = await cms
    .auth()
    .then((auth) => auth.api.getSession({ headers: c.req.raw.headers }))
    .catch(() => null);
  return session ? "admin" : "public";
}
```

- The three read routes call `readLevel(c)` and pass the level to `whereFromQuery` and `strip`.
- Run again, then the whole suite. Expect pass.

Commit: `feat(core): send private fields only with a session`

### Task 13: `/schema` sends no functions

Guard test. `c.json` already drops functions, so this is expected to pass at once. It protects `/schema` against a later switch to a serializer that keeps them.

- `src/app.test.ts`, test `schema › contains no functions`: a collection with `validate`, a function `default`, a plain `default: 'draft'` and a field hook. `JSON.stringify(await client.getSchema())` does not contain `"validate"`; the field with the function default has no `default` key; the plain default is `'draft'`; `condition` is present.
- Run: `pnpm --filter integral-cms test -- src/app.test.ts -t 'no functions'`.

Commit: `test(core): cover functions in the schema response`

### Task 14: Client types

RED

- `src/schema.test.ts`, test `client types private fields as optional and leaves hidden fields out` (type test, never called):

```ts
const cms = defineCms({
  collections: {
    people: {
      fields: {
        name: { type: "text", required: true, private: true },
        token: { type: "text", hidden: true },
      },
    },
    posts: { fields: { author: { type: "relation", collection: "people" } } },
  },
  database: { url: ":memory:" },
  secret: "",
});
async function check() {
  const person = await createClient<typeof cms>().findById("people", "x");
  // @ts-expect-error private fields are missing on public reads
  const name: string = person.name;
  // @ts-expect-error hidden fields are never sent
  person.token;
  const local = await cms.findById("people", "x");
  local?.token satisfies string | null | undefined;
  const post = await createClient<typeof cms>().findById("posts", "x");
  // @ts-expect-error also in populated documents
  post.author?.token;
}
```

- Run: `pnpm --filter integral-cms typecheck`. Expected failure: unused `@ts-expect-error` directives.

GREEN

- `src/client.ts`:

```ts
/** Fields as the HTTP API sends them: no hidden fields, private fields optional. */
type HttpFields<F extends Fields> = {
  [K in keyof F as F[K] extends { hidden: true } ? never : K]: HttpField<
    F[K] extends { private: true } ? Omit<F[K], "required"> : F[K]
  >;
};
type HttpField<F> = F extends { type: "group"; fields: infer G extends Fields }
  ? Omit<F, "fields"> & { fields: HttpFields<G> }
  : F;
type HttpSchema<S extends Schema> = {
  collections: {
    [K in keyof NonNullable<S["collections"]>]: Omit<NonNullable<S["collections"]>[K], "fields"> & {
      fields: HttpFields<NonNullable<S["collections"]>[K]["fields"]>;
    };
  };
  globals: {
    [K in keyof NonNullable<S["globals"]>]: Omit<NonNullable<S["globals"]>[K], "fields"> & {
      fields: HttpFields<NonNullable<S["globals"]>[K]["fields"]>;
    };
  };
};
type Collections<C extends { schema: Schema }> = HttpSchema<C["schema"]>["collections"];
type Globals<C extends { schema: Schema }> = HttpSchema<C["schema"]>["globals"];
```

- Every client type that reads a target collection for populate (spec 2) MUST go through `Collections<C>`, so populated documents follow their own rules.
- Run the typecheck again. Expect pass.

Commit: `feat(core): type private and hidden fields in the client`

### Task 15: Admin: description, placeholder and HTML checks

No admin unit tests exist. Manual check.

- `packages/admin/src/components/FieldInput.vue`:
  - Below the control, inside the label: `<small v-if="field.description" class="text-zinc-500">{{ field.description }}</small>`.
  - Bind with `v-bind` from one computed, so each input gets only the attributes its type has:

```ts
const attrs = computed(() => {
  const f = props.field as any;
  return {
    required: f.required,
    placeholder: f.placeholder,
    minlength: f.minLength,
    maxlength: f.maxLength,
    pattern: f.pattern,
    min: f.min,
    max: f.max,
  };
});
```

Vue drops `undefined` attributes. Browsers ignore `pattern` on `<textarea>` and `min` on text inputs, so one object serves all inputs.

- `examples/astro/collections/posts.ts`: `slug` gets `pattern: '[a-z0-9]+(-[a-z0-9]+)*'` and `description: 'Lowercase letters, digits and dashes'`; `title` gets `placeholder: 'Title'`, `maxLength: 120`.
- Manual check: `pnpm dev:astro`, open `localhost:5173/admin/`, create a post. Expect the help text under `slug`, the placeholder in `title`, and the browser blocks save for `slug: 'Hello World'`. Remove the `pattern` attribute in DevTools and save again: the server returns 400 and the admin shows the message on `slug`.
- `pnpm --filter @integral-cms/admin typecheck`.

Commit: `feat(admin): show help text and check built-in rules`

### Task 16: Admin: defaults on new documents

- `DocForm.vue`: prop `isNew?: boolean`. In the recursive initial-value function (spec 1): `initial[k] ?? (props.isNew ? f.default : undefined) ?? empty(f)`. `/schema` never contains function defaults, so `f.default` is always a plain value here.
- `DocEdit.vue`: pass `:is-new="isNew"`.
- Example: `category` gets `default: 'news'`.
- Manual check: new post shows `news` selected; an existing post without a category still shows an empty select. Create a post through the local API without `category` (or curl) and see `news` stored.

Commit: `feat(admin): pre-fill field defaults on new documents`

### Task 17: Admin: conditions

- `packages/admin/src/api.ts`: `export { matchCondition } from '../../core/src/condition'`.
- `FieldInput.vue`: new prop `root: Record<string, unknown>`; group children get `:root="root"`, and each child renders only when active:

```vue
<template v-for="(child, key) in field.fields" :key="key">
  <FieldInput
    v-if="active(child, model)"
    v-model="model[key]"
    :name="String(key)"
    :field="child"
    :root="root"
  />
</template>
```

`const active = (f: Field, sibling: Record<string, unknown>) => !f.condition || matchCondition(f.condition, props.root, sibling)`. Put it in `api.ts` next to `matchCondition` so `DocForm.vue` uses the same one.

- `DocForm.vue`: same `v-if` for top-level fields with `data` as root and sibling. In the recursive save cleanup, a field that is not active becomes `null` (its children are not visited). Evaluate conditions on the form data before cleanup, so `''` and `null` count the same.
- Example: `featured` boolean; new field `featuredNote: { type: 'text', required: true, condition: { featured: true } }`.
- Manual check:
  1. `featuredNote` is hidden until `featured` is checked; checking it shows the field and blocks save while empty.
  2. Type a note, uncheck, check again: the note is still there.
  3. Type a note, uncheck, save: the stored document has `featuredNote: null` (reload the page, or `curl localhost:4321/api/cms/collections/posts`).
- Bundle check: `pnpm build:packages`, then `grep -c ZodError packages/core/dist/admin/index.js` prints `0`. zod MUST NOT reach the admin.
- `pnpm --filter @integral-cms/admin typecheck`.

Commit: `feat(admin): show fields by condition`

### Task 18: Docs

- `README.md`:
  - New section "Field options" after the field types line: a table of the options (from the spec) and one short example each for `default`, `validate`, `condition` and `unique`.
  - State the JSON rule: functions (`validate`, function `default`, hooks) run on the server only; conditions and built-in checks run in both places; `pattern` is a string matched against the whole value with the `v` flag.
  - `private` / `hidden` table from the spec. Hidden values survive admin saves.
  - The ceiling for `unique`: one scan per unique field per write.
- `CLAUDE.md`:
  - Architecture: `src/condition.ts` (`matchCondition`, no imports, shared with the admin by relative import like `client.ts`). `dataSchema(fields, data)` is built per write because conditions depend on the data. `app.ts` owns `strip()` and `keepHidden()`; the local API sees every field.
  - Design decisions: "Private and hidden are HTTP rules", "Reads look up a session only when a cookie is sent".
  - Conventions: `src/condition.ts` MUST stay free of runtime imports; the admin bundles it.
  - Gotchas: HTML `pattern` uses the `v` flag; `<textarea>` ignores `pattern`.

Commit: `docs: describe field options`

### Task 19: Final verification

1. `pnpm test`: all green.
2. `pnpm typecheck` (no dev watcher running).
3. `pnpm build`.
4. Curl smoke test from `CLAUDE.md` on the Astro example (delete `cms.db` before and after, `npx astro dev stop` first). The example's post now needs `slug` to match the pattern; `"slug":"hello"` does. Add one line: `curl -s -b $J … -d '{"title":"Hi","slug":"Bad Slug"}' $B/api/cms/collections/posts` → 400.

## Open risks and spec gaps

- **Hidden values and HTTP `PUT`.** Task 11 reads the stored document outside the write transaction (`ponytail:` note). A local write to a hidden field in between is lost.
- **Private required fields in client input.** `HttpFields` drops `required` for private fields everywhere, so client `create` input lets them be missing and the server returns 400. Split into input and output types if that bites.
- **Populate paths through private or hidden relations.** Stripping removes the result, so nothing leaks, but the path is not rejected with 400 as a filter would be. Not in the spec.
- **`titleField` pointing at a hidden field** breaks the admin list. Not checked; add to Task 7 if wanted.
- **Session lookup on reads.** A cookie on a public read now costs one session query. A failing auth setup is swallowed and counts as public.
- **Conditions on `many` relations** compare arrays with `===` and never match `eq`. No array operator is in the spec.
- **Assumed names from specs 1 to 3** (write pipeline, startup checks, admin error display). Adapt the task text to what those plans produced.
