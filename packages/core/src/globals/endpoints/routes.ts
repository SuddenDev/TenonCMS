import { Hono } from "hono";
import type { Env } from "../../http/middleware/types.ts";
import type { Cms } from "../../cms/create-cms.ts";
import type { Schema } from "../../schema/index.ts";
import { getEndpoint } from "./get.endpoint.ts";
import { previewUrlEndpoint } from "./preview-url.endpoint.ts";
import { setEndpoint } from "./set.endpoint.ts";
import { publishEndpoint } from "./publish.endpoint.ts";
import { discardEndpoint } from "./discard.endpoint.ts";

export function globalsRoutes(cms: Cms<Schema>) {
  return {
    reads: new Hono<Env>().route("/", getEndpoint(cms)),
    writes: new Hono<Env>()
      .route("/", previewUrlEndpoint(cms))
      .route("/", setEndpoint(cms))
      .route("/", publishEndpoint(cms))
      .route("/", discardEndpoint(cms)),
  };
}
