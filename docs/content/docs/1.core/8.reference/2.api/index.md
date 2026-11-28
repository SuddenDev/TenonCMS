---
title: API
description: The three ways to reach your content.
navigation:
  title: Overview
---

Tenon has one set of operations, with three ways to call them. They share the names, the options and the access rules.

| Way                                                 | Where it runs                   | Use it for                                                            |
| --------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| [Local API](/docs/core/reference/api/local-api)     | Your server code                | Pages, hooks, tasks, scripts. No HTTP in between                      |
| [Client](/docs/core/reference/api/client)           | The browser, or another service | Islands, client components, admin pages, a frontend on another origin |
| [HTTP routes](/docs/core/reference/api/http-routes) | Anything that sends HTTP        | Other languages, tools like n8n, `curl`                               |

```ts
// Server code: the local API
import cms from "../tenon.config";
const posts = await cms.find("posts", { limit: 3 });

// Browser code: the client
import { createClient } from "tenoncms/client";
const client = createClient();
const same = await client.find("posts", { limit: 3 });
```

```sh
# Anything else: the HTTP route
curl "https://example.com/_tenon/collections/posts?limit=3"
```

## How they differ

- The imported `cms` skips the access rules. The client and the routes always apply them, for the user of the session or the API key.
- The local API reads published content. The client and the routes read drafts only in [preview](/docs/core/building-your-site/live-preview).
- Some methods exist on one side only. See [Methods only on the client](/docs/core/reference/api/client#methods-only-on-the-client).

## Related resources

- [Reading](/docs/core/working-with-content/reading) and [Writing and drafts](/docs/core/working-with-content/writing): guides with examples.
- [HTTP API and client](/docs/core/working-with-content/http-api-and-client): the client in the browser and in other services.
- [Errors and types](/docs/core/reference/errors-and-types): what a failed call throws.
