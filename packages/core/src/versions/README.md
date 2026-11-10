# versions

The history of documents and globals, like Payload's versions and Sanity's history. The content engine records versions; this module lists, reads and restores them.

## Follow a restore

`POST /collections/:name/:id/versions/:version/restore` flows through:

`endpoints/versions.endpoint.ts` → `operations/restore-version.operation.ts` → `cms.update()`

The endpoint runs behind `session` and `apiKeyReach()`, so only signed-in users reach it. `versionScope()` requires `update` on the target (`guard()`). The operation then writes the version's data through the user's local API, as a draft unless the target has `drafts: false`, in the version's locale. That write runs the whole pipeline and records a new version.

## Recording

`content/writes/persist-document.ts` calls `recordVersion()` after every save except `onDelete` effects. A draft updates the newest version when it is a draft by the same user in the same locale, saved within 30 minutes (`DRAFT_BREAK`), so autosaves keep one row per editing session. A publish and an unpublish always insert. An insert deletes the oldest versions beyond the target's `maxVersions` (default 100). Deleting a document deletes its versions.

`content/writes/unpublish-document.ts` records an `unpublished` version with the published content of the locale that went offline, in the same transaction. A no-op unpublish records none. Restoring one works like restoring any version: `restoreVersion()` ignores `status` and writes `data` back as the draft.

## Files

| Path                                      | What it does                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `types.ts`                                | `Version`, `VersionWithData`. No runtime imports: the client and the admin import them. |
| `operations/version-scope.ts`             | The caller's scope in a locale, after the `update` rule.                                |
| `operations/list-versions.operation.ts`   | The versions of one locale, newest first.                                               |
| `operations/get-version.operation.ts`     | One version, its data after `afterRead()`, without fields the caller MAY NOT read.      |
| `operations/restore-version.operation.ts` | Writes a version back as the draft, or saves it without drafts.                         |
| `endpoints/versions.endpoint.ts`          | `GET` list, `GET` one, `POST` restore on `/collections/:name/:id/versions` and globals. |

Rows live in `cms_versions`, keyed by `target` (`collection:<name>`, `global:<name>`), `doc_id` (`''` for a global) and `locale` (`NULL` when not localized). `data` holds the written data; for a localized entry, the merged document of its locale.
