import cms from "#tenon/config";
import { defineEventHandler } from "h3";

/** Puts `site.url` on each request's `event.context`, where `useTenonSeo()` reads it during SSR. */
export default defineEventHandler((event) => {
  event.context.tenonSiteUrl = cms.site.url;
});
