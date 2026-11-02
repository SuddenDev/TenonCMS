# Links

The one owner of links. Rich text and `link` fields both use it for URL safety, target resolution, the publish check, owner discovery for deletion and broken links. The field contract stays in [schema](../schema/fields/link.ts), the Tiptap parts in [richtext](../richtext/README.md), the input in `packages/admin`.

## Follow a write

`content/writes/prepare-data.ts` → `schema/fields/link.ts` → `writes/prepare-links.ts`

The zod schema of a `link` field drops read decoration (`storedLink()`) and checks the shape and URL (`checkLinkValue()`), drafts included. `prepareLinks()` then requires a collection with a `permalink` and keeps the server-owned `reference.deleted` marker (`keepDeletedMarker()`, also used by rich text). Before saving a published value, `content/writes/persist-document.ts` calls `checkLinkTargets()` (`integrity/check-links.ts`) for every reference in rich text and `link` fields.

## Follow a read

`content/reads/read-results.ts` → `reads/resolve-links.ts` → `reads/resolve-targets.ts`

`resolveLinkTargets()` loads the targets of many references with one load per collection, in the scope's perspective and locale, within each collection's read rule and read hooks. `href` is the `permalink` with the locale prefix, or a media file's URL; preview URLs are never used. `resolveLinks()` adds `href`, `title` and `broken` to `link` values in place and appends a `suffix` to the `href` (`withSuffix()`). Rich text decorates its nodes from the same targets. The scope's locale reaches resolution even when the owner is not localized.

## Follow a delete

`content/writes/remove-document.ts` → `integrity/break-links.ts` → `integrity/find-owners.ts`

`breakLinks()` runs in the deletion transaction. `linkOwners()` scans every published, draft and locale value of the collections and globals with rich text or `link` fields. A reference to the target throws `LinkedContentError` (409, `LINKED_CONTENT`) per owner value and field. With `allowBrokenLinks` it sets `reference.deleted: true` and drops the decoration.

## Value

```ts
{ reference: { collection: "pages", id: "p1" }, target: "_blank" } // stored
{ href: "https://example.com", suffix: "#team" } // stored
{ reference: { collection: "pages", id: "p1" }, suffix: "?ref=nav#team", href: "/de/about?ref=nav#team" } // read
{ reference: { collection: "pages", id: "p1" }, href: "/de/about", title: "Über uns" } // read
{ reference: { collection: "pages", id: "p1" }, href: null, broken: true } // read, unavailable
```

## Endpoints

Both need a session and read in the perspective of the preview cookie.

- `GET /admin/links/search?query=&locale=` (`client.links.search`): up to 20 title matches per collection with a `permalink`, grouped by collection. The title field is `titleField`, else the first text, textarea or slug field (`linkTitleKey()`).
- `POST /admin/links/resolve` (`client.links.resolve`): `{ references }` answers `{ href, title, broken }` per reference, in order. `{ document }` decorates unsaved rich text JSON.

## Files

| Path                       | Responsibility                                                                |
| -------------------------- | ----------------------------------------------------------------------------- |
| `config/types.ts`          | `LinkReference`, `LinkValue`, `LinkRead`, `LinkResolution`, search results.   |
| `runtime/url.ts`           | `safeLinkUrl()`, `isLinkSuffix()`, `withSuffix()`: the URL rules. No imports. |
| `runtime/value.ts`         | `checkLinkValue()`, `storedLink()`, `linkKey()`. The admin bundles it.        |
| `runtime/fields.ts`        | Rich text and `link` values inside groups, arrays and blocks.                 |
| `runtime/held-links.ts`    | Every reference of a value, and the deletion marker rules.                    |
| `runtime/title-key.ts`     | The field that names a link target.                                           |
| `reads/resolve-targets.ts` | Batched target loads with `href` and `title`.                                 |
| `reads/resolve-links.ts`   | `link` value decoration and `resolveReferences()`.                            |
| `writes/prepare-links.ts`  | Collection check and deletion markers on every write.                         |
| `integrity/check-links.ts` | Publication checks of document and image targets.                             |
| `integrity/find-owners.ts` | Published, draft and locale values of owners with links.                      |
| `integrity/break-links.ts` | Deletion conflicts and repairable broken references.                          |
| `endpoints/`               | Protected target search and resolution.                                       |

`runtime/` files MUST stay free of the CMS runtime and database imports; `url.ts`, `value.ts` and `fields.ts` are browser-safe. Reverse discovery reads JSON and needs no migration. Add an index if deletions get slow.
