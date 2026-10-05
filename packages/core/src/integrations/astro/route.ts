import type { APIRoute } from "astro";
import cms from "#integral/config";

export const prerender = false;
/** Passes every `/api/cms` request to the CMS. */
export const ALL: APIRoute = ({ request }) => cms.fetch(request);
