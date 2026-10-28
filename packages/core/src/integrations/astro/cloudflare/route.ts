import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

/** Passes every `/api/cms` request to the CMS object. */
export const ALL: APIRoute = ({ request }) => env.CMS.getByName("cms").fetch(request);
