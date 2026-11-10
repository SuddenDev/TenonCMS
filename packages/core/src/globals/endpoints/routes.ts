import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { getEndpoint } from "./get.endpoint.ts";
import { previewUrlEndpoint } from "./preview-url.endpoint.ts";
import { setEndpoint } from "./set.endpoint.ts";
import { publishEndpoint } from "./publish.endpoint.ts";
import { unpublishEndpoint } from "./unpublish.endpoint.ts";
import { discardEndpoint } from "./discard.endpoint.ts";
import { copyLocaleEndpoint } from "./copy-locale.endpoint.ts";
import { syncStructureEndpoint } from "./sync-structure.endpoint.ts";
import { removeLocaleEndpoint } from "./remove-locale.endpoint.ts";

/** Public reads, writes behind the access rules, and protected preview URLs. */
export function globalsRoutes(core: Core) {
  return {
    reads: new Hono<Env>().route("/", getEndpoint(core)),
    writes: new Hono<Env>()
      .route("/", setEndpoint(core))
      .route("/", publishEndpoint(core))
      .route("/", unpublishEndpoint(core))
      .route("/", discardEndpoint(core))
      .route("/", copyLocaleEndpoint(core))
      .route("/", syncStructureEndpoint(core))
      .route("/", removeLocaleEndpoint(core)),
    previews: new Hono<Env>().route("/", previewUrlEndpoint(core)),
  };
}
