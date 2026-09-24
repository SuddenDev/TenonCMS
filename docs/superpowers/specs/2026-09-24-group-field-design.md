# Group field

Spec 1 of 5: group field, relation field, hooks, auth hooks, page preset. Execution order: 4, 1, 2, 3, 5.

## Goal

A field type that nests fields under one key, so related fields (SEO, address, social links) are stored together and render as one section in the admin. It is a prerequisite for `seoFields` in the page preset.

## Shape

```ts
seo: {
  type: 'group',
  label: 'SEO',
  fields: {
    title: { type: 'text' },
    description: { type: 'textarea' },
    noindex: { type: 'boolean' },
  },
}
```

A group's `fields` is a `Fields` record, so groups can contain groups.

## `required`

Same meaning as on every other field:

- `required` unset or `false`: the value is `{ ... } | null` and may be missing. Readers write `doc.seo?.title`. This also covers documents saved before the group existed.
- `required: true`: the group object MUST be present.

Inner `required` fields are checked only when the group is present.

## Types (`src/schema.ts`)

- Add `(Base & { type: 'group'; fields: Fields })` to the `Field` union.
- `FieldValue<F>` returns `Data<F['fields']>` for a group, so `Data` and `Doc` infer nested types.
- `FindOptions['where']` excludes group keys.

## Validation

`fieldSchema()` returns `dataSchema(field.fields)` for a group. Unknown keys are stripped at every depth. Invalid inner data returns 400, as today.

## Filters

`where` (local API) and query-string filters (`GET /collections/:name`) stay top-level only. A group key is rejected like an unknown field: `find` throws, the HTTP route returns 400.

## Admin

- `FieldInput.vue` renders a group as a `<fieldset>` with its label (or key) as `<legend>` and one `FieldInput` per child, bound to `model[key]`.
- `DocForm.vue`: `empty()` and the save-time cleanup (empty string to `null`) become one recursive function over `fields`. A group always renders and saves as an object.
- Custom fields inside a group get the child key as `name`.

## Out of scope

- Dot-path filters (`seo.noindex`)
- `titleField` pointing into a group
- Collapsible sections, tabs
- Arrays and repeaters

## Tests (TDD: write each test, run it RED, then make it GREEN)

- `schema.test.ts`: nested validation, stripping of unknown nested keys, optional vs. required group, nested groups, type inference checked with `@ts-expect-error`.
- `app.test.ts`: create and read a document with a group over HTTP; 400 for invalid inner data; 400 for a query-string filter on a group key.
