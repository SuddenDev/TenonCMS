import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Cms } from "../../cms/create-cms.ts";
import type { Schema } from "../../schema/index.ts";
import { findEndpoint } from "./find.endpoint.ts";
import { findByIdEndpoint } from "./find-by-id.endpoint.ts";
import { createEndpoint } from "./create.endpoint.ts";
import { previewUrlEndpoint } from "./preview-url.endpoint.ts";
import { updateEndpoint } from "./update.endpoint.ts";
import { publishEndpoint } from "./publish.endpoint.ts";
import { discardEndpoint } from "./discard.endpoint.ts";
import { deleteEndpoint } from "./delete.endpoint.ts";

export function collectionsRoutes(cms: Cms<Schema>) {
  return {
    reads: new Hono<Env>().route("/", findEndpoint(cms)).route("/", findByIdEndpoint(cms)),
    writes: new Hono<Env>()
      .route("/", createEndpoint(cms))
      .route("/", previewUrlEndpoint(cms))
      .route("/", updateEndpoint(cms))
      .route("/", publishEndpoint(cms))
      .route("/", discardEndpoint(cms))
      .route("/", deleteEndpoint(cms)),
  };
}
