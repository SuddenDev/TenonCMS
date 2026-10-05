# client

`integral-cms/client`: a typed HTTP client for `/api/cms`, with the same method names as the local API. It runs in the browser and imports types only. It does not render previews; that is `integral-cms/preview` (`src/preview/`). The admin uses this client too, so there is only one HTTP client.

## Follow a read

`client.find('posts', options)` flows through:

`create-client.ts` → `read-query.ts` → `create-request.ts` → `errors.ts`

`createClient()` binds each method to its route and splits `where` and `limit` from the read options. `readQuery()` turns `populate` and `select` objects into dotted paths. `request()` builds the URL under `API_BASE`, sends the body as JSON and parses the response. A non-2xx status throws a `CmsError` with the status and the parsed body.

`client.media.upload()` runs through `upload.ts`: it creates an upload, sends the parts 4 at a time with retries, and completes it. On failure or abort it deletes the upload.

## Files

| Path                | Responsibility                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `index.ts`          | Public exports and the augmentable `Register` interface.                                   |
| `types/index.ts`    | Barrel of the public types. Internal helpers stay out.                                     |
| `types/client.ts`   | `Client`, `Session` and `Perspective`.                                                     |
| `types/schema.ts`   | The HTTP view of the schema (`Collections`, `Globals`), `RegisteredCms`, and read helpers. |
| `types/options.ts`  | `ClientOptions`, `FindOptions` and `UploadOptions`.                                        |
| `types/media.ts`    | `MediaClient`.                                                                             |
| `create-client.ts`  | `createClient()`: binds content, global, auth, preview and media methods.                  |
| `create-request.ts` | `createRequest()`: binds origin and `fetch`, serializes requests, parses replies.          |
| `read-query.ts`     | `readQuery()`: serializes `populate`, `depth` and `select`.                                |
| `upload.ts`         | `createUpload()`: multipart upload with parallel parts, retries and progress.              |
| `errors.ts`         | `CmsError`, with status and parsed body.                                                   |
| `constants.ts`      | `API_BASE`, the path of the HTTP API.                                                      |
| `register.d.ts`     | Fills `Register` with the host's `cms` type.                                               |

Each client keeps its own closures, so two clients with different origins or `fetch` functions do not share state.

The draft methods (`createDraft()`, `updateDraft()`, `publish()`, `discard()`, `setGlobalDraft()`, `publishGlobal()`, `discardGlobal()`) call the draft routes. `discard()` returns `null` when it deleted a document that was never published. `preview.enter(perspective?)` and `preview.exit()` set and clear the preview cookie; with `drafts` (the default), reads of the signed-in user see drafts.

A part upload retries a network error, a 5xx, a 408 and a 429 3 times with backoff. Any other 4xx is final.
