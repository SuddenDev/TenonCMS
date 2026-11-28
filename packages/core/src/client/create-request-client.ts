import type { Schema } from "../schema/index.ts";
import { createClient } from "./create-client.ts";
import type { Client, ClientOptions, RegisteredCms } from "./types/index.ts";

/**
 * The typed client for server code that handles one page request, such as a site on another origin than the CMS.
 * It sends the request's `cookie` header with every call to the origin of `baseUrl`, so the editor's access rules
 * and the preview cookie's drafts apply. No other header of the request travels, and the cookie goes to no other
 * origin. Without a cookie it reads as a visitor.
 *
 * It belongs to one request. It MUST NOT be shared between requests, or one visitor reads as another.
 * @param request The page request, or anything with its `headers`.
 * @example
 * const client = createRequestClient(request, { baseUrl: "https://cms.example.com" })
 * const posts = await client.find("posts")
 */
export function createRequestClient<C extends { schema: Schema } = RegisteredCms>(
  request: Pick<Request, "headers">,
  { fetch: fetchFn = fetch, ...options }: ClientOptions & { baseUrl: string },
): Client<C> {
  const cookie = request.headers.get("cookie");
  const origin = new URL(options.baseUrl).origin;

  return createClient<C>({
    ...options,
    fetch: (input, init) => {
      const forwarded = new Request(input, init);
      const toCms = new URL(forwarded.url).origin === origin;
      if (cookie && toCms) forwarded.headers.set("cookie", cookie);
      return fetchFn(forwarded);
    },
  });
}
