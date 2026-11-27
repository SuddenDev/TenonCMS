import { createRequestClient } from "../../client/create-request-client.ts";
import type { RegisteredCms } from "../../client/types/index.ts";
import type { Schema } from "../../schema/index.ts";

/** The part of a Durable Object stub that {@link createObjectClient} uses. */
export type DurableObjectStub = { fetch(request: Request): Promise<Response> };

/**
 * The HTTP client for server code outside the CMS object, for one page request. It sends to the object's `fetch` and
 * forwards the request's cookie, so the session user's access rules and the preview cookie's drafts apply.
 * @param request The page request.
 * @param stub The object's stub, e.g. `env.CMS.getByName("cms")`.
 */
export function createObjectClient<C extends { schema: Schema } = RegisteredCms>(
  request: Request,
  stub: DurableObjectStub,
) {
  return createRequestClient<C>(request, {
    baseUrl: new URL(request.url).origin,
    fetch: (input, init) => stub.fetch(new Request(input, init)),
  });
}
