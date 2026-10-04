# client

`integral-cms/client`: a typed HTTP client for `/api/cms`, with the same method names as the local API. It runs in the browser and imports types only.

| File                  | What it does                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `index.ts`            | Public exports and the augmentable `Register` interface.                                                               |
| `types.ts`            | Schema-derived document types, client contracts, and registration resolution.                                          |
| `create-client.ts`    | Binds content, auth, preview, and media methods to an instance. Upload retries and progress stay within that instance. |
| `create-request.ts`   | Binds the configured origin and fetch function; serializes requests and parses responses.                              |
| `query/read-query.ts` | Serializes populate, depth, and select options.                                                                        |
| `errors.ts`           | `CmsError`, including status and parsed error body.                                                                    |
| `constants.ts`        | The shared HTTP API path.                                                                                              |
| `register.d.ts`       | Fills `Register` with the host's CMS type.                                                                             |

The admin uses this client too, so there is only one HTTP client.

`createDraft()`, `updateDraft()`, `publish()`, `discard()`, `setGlobalDraft()`, `publishGlobal()` and `discardGlobal()` call the draft routes. `discard()` returns `null` when it deleted a document that was never published.

`preview.enter(perspective?)` and `preview.exit()` set and clear the preview cookie. With `drafts` (the default), reads of the signed-in user see drafts; with `published`, what visitors see.

`previewUrl()` and `previewGlobalUrl()` ask the server for a live preview URL. The browser runtime of the preview is not part of the client; it is `integral-cms/preview` (`src/preview/`).
