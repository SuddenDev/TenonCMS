import cms from "#tenon/config";
import { defineEventHandler, toWebRequest } from "h3";

/** Passes every `/_tenon` request to the CMS. */
export default defineEventHandler((event) => cms.fetch(toWebRequest(event)));
