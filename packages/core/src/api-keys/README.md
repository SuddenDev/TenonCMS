# api-keys

API key management. A key is its own caller: a grid of operations per target (`collection:<name>`, `global:<name>`, `schema`) decides what it MAY do. Verifying a key on a request is [auth](../auth/README.md)'s job (`caller()`, `apiKeyCaller()`); enforcing the grid is [access](../access/README.md)'s (`decide()`, `requireKeyGrant()`). This module creates, lists, revokes and deletes keys. Keys live in better-auth's `apikey` table; the grid is its `permissions`.

## Follow a create

`POST /api-keys` flows through:

`endpoints/api-keys.endpoint.ts` → `operations/create-api-key.operation.ts` → better-auth's `createApiKey()` → `db/queries/api-keys/find-api-keys.query.ts`

The endpoint runs behind `session` and `apiKeyReach()`, so a key cannot manage keys, and requires the `admin` role. It validates the body with zod: the grid MUST only name targets of the schema, each with its operations (`apiKeyTargets()`), so a key never holds a name the schema lacks. `backup` (`read` to export, `update` to import) lets a key reach the transfer routes; see `transfer/README.md`. `createApiKey()` drops empty grants and calls better-auth without a request, which passes `apiKeyRoutesOff()` and MAY set `permissions`. The caller is stored as the creator (`referenceId`); the key does not act as them. The response holds the key once and answers `no-store`.

## Files

| Path                                     | What it does                                                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                               | `ApiKeyOp`, `ApiKeyPermissions`, `ApiKeyCaller`, `ApiKey`, `NewApiKey`, `apiKeyTargets()`. No runtime imports: the client and the admin import it. |
| `to-api-key.ts`                          | `toApiKey()`: a row with its creator to the API shape, dates as ISO strings.                                                                       |
| `operations/list-api-keys.operation.ts`  | Every key, revoked ones included.                                                                                                                  |
| `operations/create-api-key.operation.ts` | Creates the key through better-auth, returns it with `key`.                                                                                        |
| `operations/roll-api-key.operation.ts`   | A new secret for an enabled key, in place: `newApiKeySecret()`, then `replaceApiKeySecret()`.                                                      |
| `operations/revoke-api-key.operation.ts` | Disables a key (`enabled = 0`). It stays listed, so `key:<id>` authors keep a name.                                                                |
| `operations/delete-api-key.operation.ts` | Deletes a key for good.                                                                                                                            |
| `endpoints/api-keys.endpoint.ts`         | Protected, admins only: `GET`/`POST /api-keys`, `POST /api-keys/:id/roll`, `POST /api-keys/:id/revoke`, `DELETE /api-keys/:id`.                    |

Queries are in `db/queries/api-keys/`. They read better-auth's table with SQL, like `db/queries/users/`, and never select the key hash.
