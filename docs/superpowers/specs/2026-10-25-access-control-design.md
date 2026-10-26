# Access control

## Scope

Payload-style `access` rules on collections, globals, media and fields, enforced in the local API next to validation. A rule is a role list, a boolean, or a function that returns a boolean or a `where` filter. Documents record who created and last changed them (`createdBy`, `updatedBy`), so a rule can limit a role to its own documents. The admin hides and disables what the user may not do.

Out of scope: `or` and operators in a `where` (equality on top-level keys only, like `find`), rules for users and invites (admins only, as today), `updatedBy` on globals, an admin bypass.

## Contract

```ts
access?: {
  read?: Rule<{ draft: boolean; id?: string }, boolean | Where>;
  create?: Rule<{ data: unknown }, boolean>;
  update?: Rule<{ id?: string; data?: unknown }, boolean | Where>; // also publish, discard, copy and remove locale
  delete?: Rule<{ id?: string }, boolean | Where>;
};
type Rule<A, R> = boolean | readonly string[] | ((args: AccessArgs & A) => R | Promise<R>);
type AccessArgs = { user; cms; context; collection?; global?; locale? };
type Where = Record<string, string | number | boolean | null>;
```

- Collections: `access`. Globals: `read` and `update`, boolean only. Media: `media.access`, like a collection.
- Fields (`Common.access`): `read`, `create`, `update`, boolean only, with `doc?`, `data?`, `siblingData?` and `path`. A join takes `read` only.
- A role list matches a signed-in user whose role is in it. A missing role counts as `editor`. There is no admin bypass: `["editor"]` excludes `admin`. Unknown role names throw at startup.
- Defaults when a slot is missing: `read` → `!draft || !!user`; `create`, `update`, `delete` → `!!user`. A host rule replaces the default. Fields default to allowed.
- `private: true` is a field `read` rule of "signed in".

## Trust

- The server `cms` and its `withDrafts()` skip every rule.
- `withSession()`, every HTTP request and public plugin routes enforce them.
- The `cms` a hook gets skips them (Payload's default), so presets and `onDelete` effects keep working. The operation that runs the hook still checks its caller.

## Semantics

- Denied without a user: `ForbiddenError` with status 401. With a user: 403.
- read `false`: 401/403. A `where` is AND-ed into the query, so a user filter on the same key cannot widen it. `findById` outside it is `undefined` (404).
- update and delete with a `where`: the document, as the drafts perspective reads it in the scope's locale, MUST match it, else 401/403. create, globals and media folder, regenerate and download operations need `true`.
- Population and rich text links: a target rule `false` reads as `null` and empty joins; a `where` filters the targets.
- A read-denied field is removed from the result, populated documents and write results included. Filtering on it is a 400.
- A create- or update-denied field keeps its stored value: the input value is dropped, inside groups and items too (items match by `id`).
- Integrity checks (references, `unique`, reverse scans) ignore rules.
- Anonymous readers get no `createdBy` and `updatedBy`, and cannot filter on them.

## Ownership

Migration `007_cms_authors` adds `created_by` and `updated_by` to `cms_documents`. Writes set them to the scope's user id, `null` for server code. Reads return `createdBy` and `updatedBy`; `find` filters on them and `select` names them.

## HTTP

- Collection, global and media write routes take an optional session; the rules decide. Plugin `middleware` still runs only with a session.
- `/schema` adds, per user, `access: { read, create, update, delete }` to each collection, global and `media` (`true`, `false`, or the `where`, which the admin matches the open document against), and `access: { read?: false, create?: false, update?: false }` to denied fields. Field rules run with no document there; the server stays the authority.

## Admin

- Entries without `read` leave the menu.
- No "new" without `create`; the form is read-only without `update`; no Delete without `delete`.
- A field without `read` is hidden; without `update` (or `create` on a new document) it is disabled and left out of the payload.
- The media library hides upload and delete accordingly.
