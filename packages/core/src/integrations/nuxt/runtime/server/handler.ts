import cms from "#tenon/config";
import { defineEventHandler, toWebRequest } from "h3";

/** Passes `/_tenon`, `/sitemap.xml` and `/robots.txt` to the CMS. */
export default defineEventHandler((event) => cms.fetch(toWebRequest(event)));
