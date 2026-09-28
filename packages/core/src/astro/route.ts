import type { APIRoute } from "astro";
import cms from "#integral/config";

export const prerender = false;
export const ALL: APIRoute = ({ request }) => cms.fetch(request);
