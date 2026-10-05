import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { getEndpoint } from "./get.endpoint.ts";
import { previewUrlEndpoint } from "./preview-url.endpoint.ts";
import { setEndpoint } from "./set.endpoint.ts";
import { publishEndpoint } from "./publish.endpoint.ts";
import { discardEndpoint } from "./discard.endpoint.ts";

export function globalsRoutes(core: Core) {
  return {
    reads: new Hono<Env>().route("/", getEndpoint(core)),
    writes: new Hono<Env>()
      .route("/", previewUrlEndpoint(core))
      .route("/", setEndpoint(core))
      .route("/", publishEndpoint(core))
      .route("/", discardEndpoint(core)),
  };
}
