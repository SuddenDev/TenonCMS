# Content engine

The shared read and write logic for collections and globals. Code: `packages/core/src/content/` (see its README). It is not a public API. Feature folders (`collections/`, `globals/`, `media/`) validate names and eligibility, then call into it.

## A write

Create, update and set-global run these steps in one transaction:

1. `beforeOperation` (collections only)
2. Access, load the stored document, and the `updatedAt` check (`write-document.ts`): a stale token throws `ConflictError` before any write hook
3. Defaults (create only), slugs
4. `beforeValidate` hooks
5. Parse and validate
6. Custom `validate`
7. `beforeChange` hooks, then parse again
8. Uniqueness and reference checks
9. Save, then record the version
10. `afterChange`, `afterRead`, `afterOperation`

At each hook stage the order is: field hooks, then the collection or global, then plugins, then root hooks.

- A failure rolls back everything, including nested calls and deletion effects. An unexpected error then runs `afterError` once, at the outermost level.
- **Draft saves** skip custom validation, uniqueness and reference checks, and `afterChange`. **Publishing** runs the full pipeline over the pending data. **Discard** drops the draft, or deletes a never-published document.
- Globals have no operation hooks.
- **Edit conflicts**: the token is `updatedAt` in milliseconds. Draft saves and publishes bump it too, since `updated_at` is per row. The check runs inside the write transaction, so SQLite fails a concurrent writer instead of letting it overwrite. Two writes in the same millisecond pass; a version column fixes that if it ever matters.

## Versions

- `persistDocument()` records a version after every save, in the same transaction. It is the one place every write passes: saves, drafts, publishes, copied locales and restores. `onDelete` effects record none.
- A version holds the written data. For a localized entry, that is the merged document of the written locale, so versions are per locale.
- A draft updates the newest version in place when that one is a draft by the same user in the same locale, saved within the last 30 minutes. Payload does the same with autosave; without it, every 800 ms autosave would add a row.
- Restore is a plain `update` or `setGlobal` with the version's data as the user (`versions/`), so access, hooks and validation run, and it records a new version.
- An insert deletes the oldest versions of that document and locale beyond `maxVersions` (default 100), in the same transaction. Deleting a document deletes its versions.

## A read

1. `beforeOperation`, then the access check (a failing rule throws before anything loads)
2. Load rows in the right perspective. A `where` from the read rule narrows the query.
3. `beforeRead`, on the loaded documents
4. Populate relations
5. `afterRead`, then removal of fields the caller cannot read
6. Media URLs, `alternates`, then `select`, then `afterOperation`

`select` runs after `afterRead`, so hooks always see full documents. The database still loads whole rows.

## Population

- One query per relation or join field, per hop, no matter how many documents there are.
- A populate plan decides which fields resolve and what plan their values continue with. Groups, arrays and blocks pass the plan through and do not count as a hop. Joins resolve only when named.
- Target collections apply their own read rule and run their own read hooks, in the same scope. A target the caller cannot read counts as missing.
- Rich text and `link` fields resolve like a relation (on with a hop left, off with `populate: false`), but in place: `resolveLinkTargets()` loads each target collection once per field per hop and adds `href` (the `permalink` in the scope's locale) and `title`. The scope's locale reaches it even when the owner is not localized. An unavailable target reads as `href: null, broken: true`.
- A missing target (dangling id, or one the caller cannot read) reads as `null` in a single relation and is left out of a `many` list.

## Integrity

- **References**: ids are checked to exist, not to point at the document itself, and files are checked for type and size, at any depth. Errors use the positional path (`links.1.page`).
- **Links**: rich text and `link` fields share one owner, `packages/core/src/links/` (see its README). Publishing checks their targets (`checkLinkTargets()`), and every write, drafts included, protects the server-owned `reference.deleted` marker. A `link` reference MUST name a collection with a `permalink`, also in drafts.
- **Deleting a link target**: `breakLinks()` runs before the row delete, in the same transaction. It scans every published, draft and locale value of owners with rich text or `link` fields and throws `LinkedContentError` per owner value and field. With `allowBrokenLinks` it sets `reference.deleted: true` and drops the read decoration instead.
- **Unique**: each top-level unique field scans the published data of the collection. A localized field compares what a read in that locale would return.
- **Deleting**: when a document goes, every relation to it applies its `onDelete` rule after the row is deleted, in the same transaction: first `restrict`, then `set-null`, then `cascade`. Effect writes skip custom validation but keep hooks.
- **Finding references**: one SQL query per relation path. An owner with a block inside itself has no complete list of paths, so it gets one text search for the id per owner, and a walk over each matching row finds the exact fields.

## Localization

- A localized entry keeps shared fields on the document row and localized fields in per-locale rows. Each locale row has its own draft and publish state.
- A read merges them: shared keys from the document, each localized key from the requested locale, else the default locale (with `fallback`), else `null`. A stored `null` falls back too.
- A write runs on the merged document of the scope's locale, then splits it back into shared and localized parts.
- A draft that leaves shared values unchanged MUST NOT create a shared draft. Otherwise every locale would show a pending change.
- A published write creates no row for a locale that has no values.
- `updatedAt` of a localized read is the later of the shared row and the requested locale's row (`map-document.ts`, and `load-locale-doc.query.ts` on the write side). A locale-only draft does not touch the shared row, so the shared row alone would miss it.
- Copy, remove and discard-by-locale are their own operations. The default locale and the last remaining locale cannot be removed.
- When the config changes which fields are localized, the first database use moves stored values between the shared and locale rows. See [gotchas](gotchas.md#localization).
