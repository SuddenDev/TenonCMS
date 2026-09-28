# Field options

Spec 6 of 6: group field, relation field, hooks, auth, page preset, field options. Execution order: 4, 1, 2, 3, 6, 5. Requires specs 1–3; spec 5 builds on it.

## Goal

The basic, type-independent field options every site needs: help text, defaults, validation, conditions, uniqueness and keeping data out of the API. Not the full Payload or Pruvious set.

## Constraint: the admin gets JSON

The admin reads the schema from `/schema` as JSON. Functions in `integral.config.ts` never reach the browser. Therefore:

- Options the admin must evaluate (conditions, built-in validation, plain defaults) MUST be serializable.
- Function options (`validate`, `hooks`, function defaults) run on the server only. Their errors reach the admin through `ValidationError` (spec 3).

## Options

| Option                              | Types                                        | Admin                      | Server            |
| ----------------------------------- | -------------------------------------------- | -------------------------- | ----------------- |
| `label`                             | all                                          | ✓ (exists)                 |                   |
| `description`                       | all                                          | help text below the field  |                   |
| `placeholder`                       | text, textarea, number, date                 | ✓                          |                   |
| `required`                          | all                                          | ✓ (exists)                 | ✓ (exists)        |
| `default`                           | all except `join`                            | pre-fills plain values     | applies on create |
| `minLength`, `maxLength`, `pattern` | text, textarea                               | HTML attributes            | zod               |
| `min`, `max`                        | number                                       | HTML attributes            | zod               |
| `validate`                          | all except `join`                            | shows errors               | runs              |
| `condition`                         | all                                          | show / hide, clear on save | skips validation  |
| `unique`                            | see below                                    |                            | runs              |
| `private`, `hidden`                 | all except `group` children of hidden groups | see below                  | see below         |
| `readOnly`                          | all, at any depth (spec 5)                   | shown disabled             | none              |
| `hooks`                             | spec 3                                       |                            |                   |

## `default`

```ts
status: { type: 'select', options: ['draft', 'live'], default: 'draft' }
author: { type: 'relation', collection: 'users', default: ({ user }) => user?.id }
```

- A plain value or `({ user, cms }) => value | Promise<value>`.
- Applied on `create` only, to fields that are `undefined` (not `null`), before `beforeValidate` hooks.
- Group children get defaults only when their group is sent on `create`. An absent group stays absent, so its required children do not apply. An `update` that sets a group gets no defaults.
- Plain values are sent in `/schema`; the admin pre-fills new documents with them. Function defaults are not sent; the admin shows an empty field and the server fills it.

## Built-in validation

- `minLength`, `maxLength`: string length.
- `pattern`: a regular expression source string, matched against the whole value (`^…$` is implied). A string, because a `RegExp` cannot travel to the admin.
- `min`, `max`: number range.

Both admin (HTML attributes) and server (zod in `dataSchema()`) enforce them. Empty optional values are not checked.

## `validate`

```ts
validate: (value, { data, siblingData, originalDoc, operation, path, cms, user }) =>
  true | string | Promise<true | string>;
```

- Server only. Runs after zod, before `beforeChange` hooks.
- Every field is checked; all messages are collected into one `ValidationError` keyed by field path (HTTP 400).
- Not run on the re-validation after `beforeChange` (spec 3), which is zod only.
- Not run on the internal `update` of an `onDelete: 'set-null'` effect (spec 3), which is zod only.

## `condition`

```ts
condition: { mediaType: 'youtube' }
condition: { price: { gt: 0 } }
condition: { $some: [{ mediaType: 'video' }, { mediaType: 'youtube' }] }
condition: { '/settings.mode': 'advanced' }
```

- A plain value means `eq`. Operators: `eq`, `ne`, `in`, `notIn`, `gt`, `gte`, `lt`, `lte`, `exists` (boolean).
- Several keys in one object must all match. `$every` and `$some` take arrays of conditions and nest.
- A key without a leading `/` is a sibling field: at the top level, a field of the document; inside a group, a field of that group. A leading `/` starts at the document root; dots walk into groups.
- One evaluator, `matchCondition(condition, data, siblingData)`, in core. The admin imports the same function, so both sides agree.
- `defineCms` MUST throw when a condition names a field that does not exist, or a `hidden` field. The admin never has hidden values, so it could not evaluate such a condition.

Behavior:

- Admin: hides fields whose condition is false and sends `null` for them on save. Values survive toggling until the editor saves.
- Server: skips `required`, built-in validation and `validate` for fields whose condition is false. The type check still runs, so typed reads stay correct. It never changes or clears values.
- Reads: no effect.

## `unique`

- Allowed on top-level `text`, `textarea`, `number`, `date`, `select`, `slug` and single `relation` fields. `defineCms` MUST throw elsewhere.
- `slug` does not exist yet when this spec runs. Spec 5 adds the type and adds `slug` to this list in the same change.
- Checked in the write transaction after `beforeChange` hooks, so values set by hooks are checked too.
- A collision returns 400 with `Already used` on the field. The document being updated does not collide with itself.
- `null` and missing values never collide. Comparison is exact and case-sensitive.
- Globals have no `unique`.
- Ceiling: one scan of the collection per unique field per write. Same upgrade path as filters (expression indexes).

## `private` and `hidden`

|           | Local API and hooks | HTTP with session (admin)                                | HTTP without session     |
| --------- | ------------------- | -------------------------------------------------------- | ------------------------ |
| `private` | read and write      | read and write                                           | not sent, not filterable |
| `hidden`  | read and write      | not sent, not filterable, not writable, not in `/schema` | not sent, not filterable |

- A filter on a field the caller cannot see returns 400, like an unknown field, so values cannot be probed.
- Hidden fields in HTTP input are ignored.
- An HTTP update replaces the whole document. It MUST keep the stored values of hidden fields, because the admin never sees them.
- The rules apply to populated and joined documents, by the rules of their own collection.
- On a `group`, the option applies to the whole group.

Types:

- Local API: every field.
- Client: `private` fields are optional (absent on public reads); `hidden` fields are omitted.

## `/schema`

Sends field definitions without functions (`validate`, `hooks`, function `default`) and without `hidden` fields.

## Out of scope

- `localized` (i18n), `index`, `virtual`, `immutable`
- Per-field access functions (roadmap #6)
- UI layout: width, sidebar position, tabs
- Types that narrow by `condition` (discriminated unions)

## Tests (TDD: write each test, run it RED, then make it GREEN)

`schema.test.ts`:

- `matchCondition`: each operator, several keys, `$every` / `$some` nested, sibling paths inside a group, root paths
- zod: `minLength`, `maxLength`, `pattern` (whole-value match), `min`, `max`; empty optional values pass
- client types: `private` optional, `hidden` omitted (`@ts-expect-error`)
- `defineCms` throws for a condition on an unknown field, for a condition on a `hidden` field and for `unique` inside a group

`app.test.ts`:

- `default`: value and function on create; not applied on update; not applied to `null`; group children get defaults only when the group is sent
- `validate`: messages per field in one 400; skipped when the condition is false; skipped on a `set-null` update, so the delete succeeds
- `condition`: a hidden `required` field may be missing; a wrong type still returns 400; values are not cleared by the server
- `unique`: collision 400, `null` never collides, updating the same document passes, a value set in `beforeChange` is checked
- `private`: missing on public reads, present with a session, filter without session 400, missing in populated docs on public reads
- `hidden`: never over HTTP, ignored in HTTP input, kept on an HTTP update, missing in `/schema`, readable and writable through the local API
- `/schema` contains no functions
