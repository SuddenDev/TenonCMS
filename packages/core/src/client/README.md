# client

`integral-cms/client`: a typed HTTP client for `/api/cms`, with the same method names as the local API. It runs in the browser and imports types only.

| File            | What it does                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `index.ts`      | `createClient()`, `CmsError`, `API_BASE`, and the types that map the schema to what HTTP returns.      |
| `register.d.ts` | Fills the `Register` interface with the host's `cms` type, so `createClient()` needs no type argument. |

The admin uses this client too, so there is only one HTTP client.
