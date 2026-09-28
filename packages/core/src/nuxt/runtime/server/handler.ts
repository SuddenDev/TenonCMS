import cms from "#integral/config";
import { defineEventHandler, toWebRequest } from "h3";

export default defineEventHandler((event) => cms.fetch(toWebRequest(event)));
