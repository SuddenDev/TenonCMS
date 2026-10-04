# client

`integral-cms/client`: a typed HTTP client for `/api/cms`, with the same method names as the local API. It runs in the browser and imports types only.

| File            | What it does                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `index.ts`      | `createClient()`, `CmsError`, `API_BASE`, and the types that map the schema to what HTTP returns.      |
| `register.d.ts` | Fills the `Register` interface with the host's `cms` type, so `createClient()` needs no type argument. |

The admin uses this client too, so there is only one HTTP client.

`createDraft()`, `updateDraft()`, `publish()`, `discard()`, `setGlobalDraft()`, `publishGlobal()` and `discardGlobal()` call the draft routes. `discard()` returns `null` when it deleted a document that was never published.

`preview.enter(perspective?)` and `preview.exit()` set and clear the preview cookie. With `drafts` (the default), reads of the signed-in user see drafts; with `published`, what visitors see.

`previewUrl()` and `previewGlobalUrl()` ask the server for a live preview URL. The browser runtime of the preview is not part of the client; it is `integral-cms/preview` (`src/preview/`).
