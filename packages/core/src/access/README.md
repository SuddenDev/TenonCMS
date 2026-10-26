# access

Access rules on collections, globals, media and fields, enforced in the local API next to validation. Types in `types.ts` are public (`Access`, `GlobalAccess`, `FieldAccess`, `Rule`, `Where`). The module runs inside [content](../content/README.md) pipelines and [media](../media/README.md) routes. It does not parse requests or know about HTTP.

## Follow a read

`cms.find("posts")` flows through:

`content/reads/read-documents.ts` → `rule.ts` (`permit()`) → `db/queries/documents/find-documents.query.ts` → `content/lifecycle/run-read-hooks.ts` → `field-access.ts` (`stripDenied()`)

`read()` asks `permit()` for `read`. A denied caller gets `ForbiddenError`. A `where` goes to `findDocs` as `access`, AND-ed with the caller's `where`. After the read hooks, `afterRead()` calls `stripDenied()`, which walks the fields with `eachField()` and removes the ones the caller MAY NOT read from every result, populated documents and write results included.

## Follow a write

`cms.update("posts", id, data)` flows through:

`content/writes/write-document.ts` → `rule.ts` (`guard()`) → `field-access.ts` (`dropDenied()`)

`write()` calls `guard()` for `create` or `update` before it loads anything, so a denied caller learns nothing about missing documents. With a `where`, `guard()` loads the document and the `where` MUST match it. `dropDenied()` then removes input values of fields the caller MAY NOT write and puts the stored value back. `remove()` calls `permit()` for `delete` first, then matches the `where` against the document it loads.

## Trust

`Scope.overrideAccess` skips every rule. The server `cms` and its `withDrafts()` set it; `withSession()` and every HTTP scope do not. So host code that renders for visitors MUST read through `withSession()` or HTTP, or it sees everything. `inner()` keeps the caller's flag on the scope, so an operation checks its caller, and binds the `cms` that hooks get with `overrideAccess`, so presets, `onDelete` effects and cascades keep working.

The admin shows what `/schema` allows: `withPermissions()` runs each rule for the signed-in user, `read` in the perspective of the preview cookie. The admin hides an entry without `read`. User management is not an access rule: it belongs to the built-in `admin` role (see `../users/`).

## Files

| Path              | Responsibility                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `types.ts`        | The public rule types.                                                                                                                                                                                                               |
| `rule.ts`         | `check()` runs one rule, `decide()` a collection or global rule with its default, `permit()` throws for `false`, `matches()` tests a `where`, `enforce()`, `guard()`, `guardAll()`, `readAccess()` and `readable()` throw or answer. |
| `field-access.ts` | `fieldAllowed()` for one field, `stripDenied()` after `afterRead()`, `dropDenied()` before a write merges its input.                                                                                                                 |
| `permissions.ts`  | `withPermissions()`: the caller's `access` in `/schema`.                                                                                                                                                                             |
| `check-access.ts` | `checkAccess()` at startup: known roles, `read` only on joins.                                                                                                                                                                       |

## Where else the rules run

- Population (`hop()`) and rich text links filter their targets with `decide()` and `matches()`.
- Discard, copy and remove of a locale guard `update`.
- Media: an upload checks `create` before any byte is stored; folder renames and regeneration need `update` without a `where` (`guardAll()`), archives `read`. `/folders` lists the folders of the files a `where` lets the caller read (`readAccess()`). `/files`, `/img` and single downloads check `read` per file with `readable()`; `/files` and `/img` look up a session only when a read rule exists.
- `onDelete` effects (`effect`) and integrity checks ignore the rules.
- A group or an item replaces its stored value as a whole, so `dropDenied()` puts back a field inside it that the caller cannot read and the input leaves out.
