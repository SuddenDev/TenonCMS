# cms

`defineCms()` and the local API it returns. All reads and writes run through here, whether they come from server code, HTTP or a hook.

| File          | What it does                                                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`    | `defineCms()`: adds the settings globals (`addSettings()`), checks the schema, connects lazily, builds `Core` and the `cms` object with `drafts()` and `forRequest()`. |
| `options.ts`  | `CmsOptions`, the options type of `defineCms()`, and the plugin and settings type math (`SettingsGlobals`).                                                            |
| `scope.ts`    | `Core` (what every file below needs from the instance), `Scope` (one call: user, transaction, context, perspective) and small shared helpers.                          |
| `api.ts`      | `bind()`: the local API methods. `Api`: their typed interface with the docs.                                                                                           |
| `run.ts`      | `run()`: wraps every call with `beforeOperation` / `afterOperation`, the transaction and `afterError`.                                                                 |
| `read.ts`     | `find`, `findOne`, `findById`, `getGlobal`: load, read hooks, populate, `select`.                                                                                      |
| `write.ts`    | `create`, `update`, `setGlobal`, `delete`: the write pipeline.                                                                                                         |
| `populate.ts` | Resolves relations and joins on read, and applies `select`.                                                                                                            |
| `refs.ts`     | Integrity rules: ids must exist, `unique`, and `onDelete` (`restrict`, `set-null`, `cascade`).                                                                         |
| `auth.ts`     | better-auth setup. Only the first user can sign up without a session.                                                                                                  |

## One write

```
api.ts  create()
  └ run.ts  run()            beforeOperation, open transaction
      └ write.ts  write()    defaults, slugs, beforeValidate, validate, beforeChange,
                             validate again, unique, refs, save, afterChange, afterRead
      afterOperation, commit (or afterError on failure)
```

## One read

```
api.ts  find() → run.ts run() → read.ts read()
  check where / select → db → beforeRead → populate → afterRead → select
```

Hooks get their own `cms` (built by `inner()` in `scope.ts`). Calls through it share the transaction, `context` and the perspective.

## Perspective

A read sees published documents (default) or drafts (`Scope.drafts`). `cms.drafts()` returns the instance in the drafts
perspective. `cms.forRequest(request)` returns it with the session user, in the drafts perspective when the request
carries the preview cookie (`PREVIEW_COOKIE` in `http/middleware.ts`) and a valid session. Read options never carry it.
