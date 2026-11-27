# client

`tenoncms/client`: a typed HTTP client for `/_tenon`, with the same method names as the local API. It runs in the browser and imports types only, besides the import-free helpers and `formatMask()` (maska). It does not render previews; that is `tenoncms/preview` (`src/preview/`). The admin uses this client too, so there is only one HTTP client.

## Follow a read

`client.find('posts', options)` flows through:

`create-client.ts` → `read-query.ts` → `create-request.ts` → `errors.ts`

`createClient()` binds each method to its route and splits `where` and `limit` from the read options. `readQuery()` turns `populate` and `select` objects into dotted paths. `request()` builds the URL under `API_BASE`, sends the body as JSON and parses the response with `readReply()`. A non-2xx status throws a `CmsError` with the status and the parsed body. So does a 2xx answer that is not JSON, such as a host page for a method that the host's route does not hand to the CMS. Only a `204` resolves to `null` without a body.

`client.media.upload()` runs through `upload.ts`: it creates an upload, sends the parts 4 at a time with retries, and completes it. On failure or abort it deletes the upload.

## Files

| Path                | Responsibility                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `index.ts`          | Public exports and the augmentable `Register` interface.                                       |
| `types/index.ts`    | Barrel of the public types. Internal helpers stay out.                                         |
| `types/client.ts`   | `Client`, `Session`, `Perspective`, `DeviceCode`, `LocaleOption` and `DiscardOption`.          |
| `types/schema.ts`   | The HTTP view of the schema (`Collections`, `Globals`), `RegisteredCms`, and read helpers.     |
| `types/options.ts`  | `ClientOptions`, `FindOptions` and `UploadOptions`.                                            |
| `types/media.ts`    | `MediaClient`.                                                                                 |
| `create-client.ts`  | `createClient()`: binds content, global, auth, preview and media methods.                      |
| `create-request.ts` | `createRequest()`: binds origin and `fetch`, serializes requests, parses replies.              |
| `read-query.ts`     | `readQuery()`: serializes `populate`, `depth`, `select`, `locale`, `fallback`, `alternates`.   |
| `upload.ts`         | `createUpload()` and `sendFile()`: multipart upload with parallel parts, retries and progress. |
| `errors.ts`         | `CmsError`, with status and parsed body.                                                       |
| `constants.ts`      | `API_BASE` (the path of the HTTP API), `API_KEY_HEADER`, `LOCK_TTL` and `DEVICE_CLIENT_ID`.    |
| `register.d.ts`     | Fills `Register` with the host's `cms` type.                                                   |

Each client keeps its own closures, so two clients with different origins or `fetch` functions do not share state.

`requestPasswordReset({ email, redirectTo })` asks Better Auth to send a reset link. Its response does not reveal whether an account exists. `resetPassword({ token, newPassword })` consumes that link's single-use token and does not sign in. Both methods use the existing auth endpoints; the host must configure email delivery or its own `sendResetPassword` callback.

`signInMagicLink({ email, callbackURL, errorCallbackURL })` asks the `magicLink()` plugin to email a link. `sendSignInCode({ email })` and `signInWithCode({ email, otp })` use the `emailOTP()` plugin with `type: "sign-in"`. They work only when the server has the plugin and can send email (`/auth-status`).

The draft methods (`createDraft()`, `updateDraft()`, `publish()`, `unpublish()`, `discard()`, `setGlobalDraft()`, `publishGlobal()`, `unpublishGlobal()`, `discardGlobal()`) call the draft routes. `schedule(name, id, { action, at, locale })` and `scheduleGlobal(name, { action, at, locale })` post to `/collections/:name/:id/schedule` and `/globals/:name/schedule` and return `{ id }`, the job id; `at` MAY be a `Date`, a number or an ISO string. `discard()` returns `null` when it deleted a document that was never published. `preview.enter(perspective?)` and `preview.exit()` set and clear the preview cookie; with `drafts` (the default), reads of the signed-in user see drafts.

`export()`, `exportLink()` and `exportSummary()` take `{ media, scope }`; `checkImport(manifest, { mode })` posts a manifest to `/import/check` for a dry run, and `readArchiveManifest(blob)` (from `transfer/format.ts`, which imports only the import-free `read-zip.ts`) reads it from a file. `device` holds better-auth's device flow, which `tenon login` uses.

A part upload retries a network error, a 5xx, a 408 and a 429 3 times with backoff. Any other 4xx is final.

## Locales

`Locale<C>` (from `schema/inference/locale.ts`, exported by `tenoncms/client`) is the union of the instance's `localization.locales`, `never` without it; the admin's untyped client allows any string.

- Reads take `locale`, `fallback` and `alternates`, sent as `?locale=`, `?fallback=` and `?alternates=`.
- Writes, drafts, `publish()`, `unpublish()` and `unpublishGlobal()` take `{ locale }`. Saves, draft saves and publishes also take `{ updatedAt }` (`?updatedAt=`): a newer stored version answers 409. `discard()` and `discardGlobal()` take `{ locale }` or `{ all: true }` (`?all=true`).
- `copyLocale(name, id, { from, to })` and `removeLocale(name, id, locale)` call `/collections/:name/:id/locales/…`; `copyGlobalLocale()` and `removeGlobalLocale()` call `/globals/:name/locales/…`.
- `setSyncStructure(name, id, sync, { locale, dryRun })` posts to `/collections/:name/:id/structure`, `applySyncStructure(name, { dryRun })` to `/collections/:name/structure/apply`, and `setGlobalSyncStructure()` to `/globals/:name/structure`.
- `previewUrl()` and `previewGlobalUrl()` take `{ locale }` as the third argument.
- `localization()` fetches the public `GET /localization` once and keeps the promise per client; a failed request is not kept. The result is the normalized config (`locales`, `defaultLocale`, `fallback`, `routing`), or `null` without `localization`.
- `LocaleMeta` types `locale`, `locales`, `sharedDraft` and, with `alternates: true`, `alternates` only for collections with a literal `localized: true`. Globals get `locale`, `locales` and `sharedDraft`.

The path helpers `localeFromPath()`, `localizePath()` and `switchTarget()` are exported from here too. They take the result of `localization()`.
