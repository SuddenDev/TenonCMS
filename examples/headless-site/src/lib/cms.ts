import { TENON_CMS_URL } from "astro:env/client";
import { createRequestClient } from "tenoncms/client";
import type cms from "../../../standalone/tenon.config";

/**
 * The CMS client of one page request. It forwards the request's cookies, so an editor with the preview cookie reads
 * drafts and everyone else reads published content. It MUST NOT be shared between requests.
 */
export const cmsClient = (request: Request) =>
  createRequestClient<typeof cms>(request, { baseUrl: TENON_CMS_URL });
