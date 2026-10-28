# access

Access rules on collections, globals, media and fields, enforced in the local API next to validation. Types in `types.ts` are public (`Access`, `GlobalAccess`, `FieldAccess`, `Rule`, `Where`). The module runs inside [content](../content/README.md) pipelines and [media](../media/README.md) routes. It owns policy interpretation; result hooks, population and projection stay in content. Published media admission resolves the request caller before raw byte serving.

## Follow a read

`cms.find("posts")` flows through:

`content/reads/read-documents.ts` → `read.ts` (`requireRead()`, `checkReadWhere()`) → `db/queries/documents/find-documents.query.ts` → `content/lifecycle/run-read-hooks.ts` → `field-access.ts` (`stripDenied()`)

`read()` asks `requireRead()` for admission. A denied caller gets `ForbiddenError`. A `where` goes to `findDocs` as `access`, AND-ed with the caller's `where`. After the read hooks, `afterRead()` calls `stripDenied()`, which walks the fields with `eachField()` and removes the ones the caller MAY NOT read from every result, populated documents and write results included.

## Follow a write

`cms.update("posts", id, data)` flows through:

`content/writes/write-document.ts` → `rule.ts` (`guard()`) → `field-access.ts` (`dropDenied()`)

`writeDocument()` calls `guard()` for `create` or `update` before it loads anything, so a denied caller learns nothing about missing documents. With a `where`, `guard()` loads the document and the `where` MUST match it. `dropDenied()` then removes input values of fields the caller MAY NOT write and puts the stored value back. `remove()` calls `permit()` for `delete` first, then matches the `where` against the document it loads.

## Trust

An API key caller has `apiKey` and no `user`. `decide()` checks its grid first: without `op` on the target, it is `false` (403), through HTTP and `withSession()`. Then a missing rule or a role list passes, because the grid replaces them; a boolean stays as it is; a function runs with `apiKey`. Field rules run as for a visitor, so a role list or `private` hides a field from a key. `stripDenied()` keeps `createdBy` / `updatedBy` for a key. Writes that run no rule, an upload's parts, completion and abort, call `requireKeyGrant()` through `findUpload()`.

`Scope.overrideAccess` skips every rule. The server `cms` and its `withDrafts()` set it; `withSession()` and every HTTP scope do not. So host code that renders for visitors MUST read through `withSession()` or HTTP, or it sees everything. `inner()` keeps the caller's flag on the scope, so an operation checks its caller, and binds the `cms` that hooks get with `overrideAccess`, so presets, `onDelete` effects and cascades keep working.

The admin shows what `/schema` allows: `withPermissions()` runs each rule for the caller (a user, or a key with `schema: ["read"]`), `read` in the perspective of the preview cookie. The admin hides an entry without `read`. User management is not an access rule: it belongs to the built-in `admin` role (see `../users/`).

## Files

| Path              | Responsibility                                                                                                                                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`        | The public rule types.                                                                                                                                                                                                                                                      |
| `rule.ts`         | `check()` runs one rule, `decide()` a collection or global rule with its default, `permit()` throws for `false`, `matches()` tests a `where`, `enforce()`, `guard()`, `guardAll()` enforce write rules; `requireKeyGrant()`: an API key's grid for writes that run no rule. |
| `read.ts`         | Read decisions, query-field eligibility, row admission and published-media admission.                                                                                                                                                                                       |
| `field-access.ts` | `fieldAllowed()` for one field, `stripDenied()` after `afterRead()`, `dropDenied()` before a write merges its input.                                                                                                                                                        |
| `permissions.ts`  | `withPermissions()`: the caller's `access` in `/schema`.                                                                                                                                                                                                                    |
| `check-access.ts` | `checkAccess()` at startup: known roles, `read` only on joins.                                                                                                                                                                                                              |

## Where else the rules run

- Population (`hop()`) and rich text links filter their targets with `readDecision()` and `admittedRows()` from `read.ts`. Rich-text search skips collections whose search field fails `canQueryField()` without a document.
- Discard, copy and remove of a locale guard `update`.
- Media: an upload checks `create` before any byte is stored; folder renames and regeneration need `update` without a `where` (`guardAll()`); archives require unrestricted published read access with `requireAllRead()`. `/folders` lists the folders of the files a `where` lets the caller read (`readAccess()`). `/files`, `/img` and single downloads check `read` per file with `readable()`; `/files` and `/img` use `publishedMedia()` and skip session lookup only for an omitted rule. Literal `false` denies.
- `onDelete` effects (`deletion-effect`) and integrity checks ignore the rules.
- A group or an item replaces its stored value as a whole, so `dropDenied()` puts back a field inside it that the caller cannot read and the input leaves out.
