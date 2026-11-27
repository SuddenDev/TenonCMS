# Lifecycle hooks

Hooks of the CMS itself, next to the [content hooks](./hooks.md). The host sets them on `defineCms()`, plugins on `definePlugin()`. Plugins run in the order of `plugins`, then the host. Each hook gets the server `cms`, which skips the access rules.

When a database is used the first time in a process, the CMS runs:

1. the migrations,
2. `seed`, once per database,
3. `onInit`,
4. then the first query or request.

Nothing runs at import time. Every query waits until the steps are done. A failure in `seed` or `onInit` fails that query and is tried again on the next one.

## seed

Fills a new database, for example with sample content:

```ts
import { openAsBlob } from "node:fs";

export default defineCms({
  // ...
  seed: async ({ cms }) => {
    await cms.import(await openAsBlob("seed/content.zip"));
    await cms.create("posts", { title: "Welcome" });
  },
});
```

- A table `cms_seeds` records which seeds ran. Each seed runs once per database.
- The host's seed runs only when the database has no documents and no globals. A site that adds `seed` later is not seeded.
- A plugin's seed runs the first time the plugin starts on a database, also on one with content. Use it to install defaults. A plugin that is removed and added again does not seed again.
- All seeds of one start run in one transaction, together with their records. If one throws, nothing is kept, and all of them run again on the next start. Media files that a seed uploads stay in storage.
- Use the `cms` the seed gets. Inside the transaction, any other instance waits forever on a single-connection database.

Make a seed archive by building the content in the admin, then downloading it under **Manage → Backup**. See [Backup and restore](./backup.md).

## onInit

Runs on every start, after the seeds:

```ts
onInit: async ({ cms }) => {
  const site = await cms.getGlobal("general");
  console.log(`Serving ${site.name}`);
},
```

Serverless hosts start a process often, sometimes for each request. Keep `onInit` fast and safe to run many times.

## afterImport

Runs after `cms.import()` commits. An import skips the content hooks, so rebuild what they would have kept up to date:

```ts
afterImport: async ({ cms, mode, counts }) => {
  await rebuildSearchIndex(cms);
},
```

If it throws, the import call throws too, but the imported content stays.

## afterError

Gets unexpected errors, for reporting them to a service such as Sentry:

```ts
afterError: async ({ error, source, request, job }) => {
  Sentry.captureException(error, { tags: { source }, extra: { url: request?.url, job } });
},
```

| `source`  | When                                                                    |
| --------- | ----------------------------------------------------------------------- |
| `request` | A route answers 500. Expected errors (400, 401, 403, 404, 409) skip it  |
| `job`     | A job attempt throws. `job` has `id`, `task`, `attempts`, `maxAttempts` |
| `seed`    | A seed throws                                                           |
| `init`    | An `onInit` throws                                                      |

- An error that `afterError` throws is logged and dropped.
- Errors of the local API that your own server code calls reach your own `catch`, not `afterError`.
