import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Core } from "../../cms/runtime/types.ts";
import { findEndpoint } from "./find.endpoint.ts";
import { findByIdEndpoint } from "./find-by-id.endpoint.ts";
import { createEndpoint } from "./create.endpoint.ts";
import { previewUrlEndpoint } from "./preview-url.endpoint.ts";
import { updateEndpoint } from "./update.endpoint.ts";
import { publishEndpoint } from "./publish.endpoint.ts";
import { unpublishEndpoint } from "./unpublish.endpoint.ts";
import { discardEndpoint } from "./discard.endpoint.ts";
import { copyLocaleEndpoint } from "./copy-locale.endpoint.ts";
import { syncStructureEndpoint } from "./sync-structure.endpoint.ts";
import { removeLocaleEndpoint } from "./remove-locale.endpoint.ts";
import { deleteEndpoint } from "./delete.endpoint.ts";

/** Public reads, writes behind the access rules, and protected preview URLs. */
export function collectionsRoutes(core: Core) {
  return {
    reads: new Hono<Env>().route("/", findEndpoint(core)).route("/", findByIdEndpoint(core)),
    writes: new Hono<Env>()
      .route("/", createEndpoint(core))
      .route("/", updateEndpoint(core))
      .route("/", publishEndpoint(core))
      .route("/", unpublishEndpoint(core))
      .route("/", discardEndpoint(core))
      .route("/", copyLocaleEndpoint(core))
      .route("/", syncStructureEndpoint(core))
      .route("/", removeLocaleEndpoint(core))
      .route("/", deleteEndpoint(core)),
    previews: new Hono<Env>().route("/", previewUrlEndpoint(core)),
  };
}
