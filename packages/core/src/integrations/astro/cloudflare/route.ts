import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

/** Passes `/_tenon`, `/sitemap.xml` and `/robots.txt` to the CMS object. */
export const ALL: APIRoute = ({ request }) => env.CMS.getByName("cms").fetch(request);
