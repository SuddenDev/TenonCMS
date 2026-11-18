# Hooks

Hooks run your code at fixed points of every read, write and delete. Use them to change data, check it across documents, add computed values or react to changes. The names follow Payload's.

```ts
import { defineCollection, ValidationError } from "tenoncms";

export const posts = defineCollection({
  fields: {
    title: {
      type: "text",
      required: true,
      hooks: { beforeChange: [({ value }) => value?.trim()] },
    },
    slug: { type: "text", required: true },
  },
  hooks: {
    beforeChange: {
      uniqueSlug: async ({ data, id, cms }) => {
        const other = await cms.findOne("posts", { where: { slug: data.slug } });
        if (other && other.id !== id) throw new ValidationError({ slug: "Already used" });
      },
    },
    afterRead: [({ docs }) => docs.map((d) => ({ ...d, url: `/blog/${d.slug}` }))],
  },
});
```

- Each stage takes an array or a record of functions. They run in order. A record lets a host leave one out by name: `const { uniqueSlug, ...rest } = posts.hooks.beforeChange`.
- A hook receives one object and MAY be async. It MAY return a replacement for its main value. `undefined` keeps the value.
- Hooks run for every local API call. HTTP and the admin call the local API, so they run there too.

## Stages

| Hook                             | Where                                       | Main value                | Other arguments                  |
| -------------------------------- | ------------------------------------------- | ------------------------- | -------------------------------- |
| `beforeOperation`                | collection                                  | `args` (the call's input) | `operation`                      |
| `beforeValidate`, `beforeChange` | collection, global, field                   | `data`                    | `operation`, `id`, `originalDoc` |
| `afterChange`                    | collection, global, field                   | `doc`                     | `operation`, `previousDoc`       |
| `beforeRead`, `afterRead`        | collection, global (`afterRead` also field) | `docs` (array)            | `operation`                      |
| `beforeDelete`, `afterDelete`    | collection                                  | none                      | `id`, `doc`                      |
| `afterOperation`                 | collection                                  | `result`                  | `operation`, `args`              |
| `afterError`                     | collection, `defineCms`                     | none                      | `error`, `operation`             |

Every hook also receives:

- `cms`: the local API. Use this one, not the imported instance.
- `user`: the session user of an HTTP write, else `null`.
- `context`: one object shared by all hooks of an operation.
- `collection` or `global`: which one is running.
- `locale`: the locale of the call.

Field hooks receive `value`, plus `data`, `siblingData` (the group that holds the field), `originalDoc` and `path` (like `seo.title`).

## Root hooks

Root hooks run for every collection and global. `defineCms({ hooks })` takes every stage of the table. `collection` or `global` says which one is running, and `data`, `doc` and `docs` are untyped. Globals run only their own stages. [Plugins](./plugins.md) add hooks the same way.

```ts
defineCms({
  hooks: {
    afterChange: [
      ({ collection, global, doc }) => console.log("changed", collection ?? global, doc.id),
    ],
  },
});
```

## Order

```text
create, update, setGlobal: beforeOperation → defaults (create) → beforeValidate → validation → validate → beforeChange → validation → unique → write → afterChange → afterRead → afterOperation
find, findOne, findById, getGlobal: beforeOperation → beforeRead → populate → afterRead → afterOperation
delete: beforeOperation → beforeDelete → delete + onDelete effects → afterDelete → afterOperation
```

- At each stage, field hooks run first (in field order, depth-first into groups), then the collection's or global's, then the plugins', and last the root hooks. [Webhooks](./webhooks.md) queue after the root hooks of `afterChange` and `afterDelete`. A group's own hooks run before its fields'.
- Globals have no `beforeOperation` and `afterOperation`.
- `beforeChange` receives validated data, and its result is validated again, so a hook cannot store invalid data.
- `afterRead` runs once per read with all documents (a field's `afterRead` once per value). Documents loaded by `populate` run their own collection's `beforeRead` and `afterRead`, once per relation field per hop.
- `onDelete` effects run through `update` and `delete`, with all their hooks. A `set-null` update skips `validate` and the id checks, because it only clears a reference and the document's other relations MAY point to documents the same delete removes.

## Errors

- `throw new ValidationError({ slug: 'Already used' })` (from `tenoncms`). Keys are field paths. HTTP returns 400 with `{ message, errors: { [path]: message } }`, and the admin shows each message next to its field. The local API validates every write the same way.
- Any other error rolls back the operation and runs the collection's `afterError`, then the root one: `defineCms({ hooks: { afterError: [...] } })`. HTTP returns 500 without the message. Global operations run only the root `afterError`, with `global` set.
- Every HTTP error body has `message`, like better-auth's. The client's `CmsError` uses it as its message and keeps the body in `body`.
- `ValidationError` (400) and `ConflictError` (409) are expected and run no `afterError`. An error inside `afterError` is logged and does not replace the original.

## Transactions and `context`

Every write runs in one transaction with its hooks, its `onDelete` effects and every `cms` call made in them. An error rolls all of it back. Reads open no transaction. A read inside a write uses the write's transaction. On drivers without interactive transactions (Cloudflare D1, later), hooks run in the same order without isolation.

A hook that writes to its own collection runs its own hooks again. Stop the loop with `context`, which is shared by all hooks of the operation and every nested call:

```ts
afterChange: [
  async ({ doc, cms, context }) => {
    if (context.counted) return;
    context.counted = true;
    await cms.update("posts", doc.id, { views: (doc.views ?? 0) + 1 });
  },
];
```

## Types

- `defineCollection()` and `defineGlobal()` type `data`, `doc`, `docs` and `originalDoc` from their fields. Hooks in a collection written inline in `defineCms` get untyped (`any`) arguments.
- `cms` in hooks is untyped: names and data are plain strings and records.
- Field hooks type only `value`.

## Coming from Payload

The hook names are the same. `req.user` is `user`, `req.context` is `context`, and `req.payload` is `cms`.
