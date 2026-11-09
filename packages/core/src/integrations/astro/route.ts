import type { APIRoute } from "astro";
import cms from "#tenon/config";

export const prerender = false;

/** Passes `/_tenon`, `/sitemap.xml` and `/robots.txt` to the CMS. */
export const ALL: APIRoute = ({ request }) => cms.fetch(request);
