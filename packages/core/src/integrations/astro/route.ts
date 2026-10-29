import type { APIRoute } from "astro";
import cms from "#tenon/config";

export const prerender = false;

/** Passes every `/_tenon` request to the CMS. */
export const ALL: APIRoute = ({ request }) => cms.fetch(request);
