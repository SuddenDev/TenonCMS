# locks

Edit locks for the admin, like Payload's and WordPress's: one user edits a document or global at a time, others see who and MAY take over. Locks only guide the admin. Writes do not check them; the `updatedAt` check in `content/writes/write-document.ts` protects against overwrites.

## Follow a claim

`POST /collections/:name/:id/lock` flows through:

`endpoints/locks.endpoint.ts` → `operations/lock-target.operation.ts` → `db/queries/locks/claim-lock.query.ts`

The endpoint runs behind `session` and `apiKeyReach()`, so only signed-in users lock. The operation requires `update` on the target (`guard()`), then claims in one upsert: the lock moves to the caller when it is free, expired (`LOCK_TTL`), already theirs, or `takeover` is set. The answer names the holder, so a user who lost the lock learns it on their next renewal.

## Files

| Path                                    | What it does                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| `types.ts`                              | `Lock`: `{ mine, user }`. No runtime imports: the client and the admin import it. |
| `operations/lock-target.operation.ts`   | Claims or renews a lock, after the update rule.                                   |
| `operations/unlock-target.operation.ts` | Frees the caller's lock. Someone else's stays.                                    |
| `endpoints/locks.endpoint.ts`           | `POST`/`DELETE` on `/collections/:name/:id/lock` and `/globals/:name/lock`.       |

Rows live in `cms_locks`, keyed by `target` (`collection:<name>`, `global:<name>`) and `id` (`''` for a global). An expired row counts as free and is overwritten by the next claim. The row of a deleted document stays; it does no harm.
