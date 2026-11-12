# lifecycle

Hooks of the CMS itself: `seed`, `onInit`, `afterImport` and `afterError`. The host sets them on `defineCms()`, plugins on `definePlugin()`. `owners()` lists the plugins in order, then the host (`core.lifecycle`). The guide is [Lifecycle hooks](../../../../docs/guide/lifecycle.md).

## The start gate

`bindDatabase()` in `cms/create-cms.ts` wraps `core.db()`. The first call connects and migrates, then runs `runSeeds()` and `runInit()` once. Every later call waits for that promise. A failure reports to `afterError` and drops the promise, so the next query retries.

The hooks run on `starting`, a copy of `core` whose `db` is the raw connection. With the gated one, a seed's first query would wait for the seed.

## Seeds

`runSeeds()` runs all seeds that have no row in `cms_seeds` in one `transaction()`:

1. Read the markers. Stop when all seeds ran.
2. Check once whether the database has documents or globals. This happens before any seed writes, so a plugin's seed does not stop the host's.
3. For each pending seed: insert its marker with `ON CONFLICT DO NOTHING`. A row that was not inserted means another instance seeded it. Skip the host's seed on a database with content, keeping the marker. Then run the seed with the transaction's `cms`.

A throw rolls back the seeds and the markers together.

## Errors

`reportError()` calls every `afterError` and logs a hook that throws. It is called by:

- `errorHandler()` in `http/errors.ts`, for a 500 only;
- `execute-job.ts`, for each failed attempt;
- the start gate, with the `starting` API.

## Files

| File               | Role                                                           |
| ------------------ | -------------------------------------------------------------- |
| `types.ts`         | `LifecycleHooks`, `ErrorContext`                               |
| `run-lifecycle.ts` | `runSeeds()`, `runInit()`, `runAfterImport()`, `reportError()` |
