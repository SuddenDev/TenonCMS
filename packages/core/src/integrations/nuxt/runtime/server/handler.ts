import cms from "#integral/config";
import { defineEventHandler, toWebRequest } from "h3";

/** Passes every `/api/cms` request to the CMS. */
export default defineEventHandler((event) => cms.fetch(toWebRequest(event)));
