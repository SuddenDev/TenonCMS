import { defineMiddleware } from "astro:middleware";
import cms from "#integral/config";
import { API_BASE } from "integral-cms/client";

// Pages get the instance of the request's user, in the drafts perspective inside the admin's preview.
// Prerendered pages have no request headers, and API routes look up the session themselves.
export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.integral =
    context.isPrerendered || context.url.pathname.startsWith(API_BASE)
      ? cms
      : await cms.withSession(context.request);
  return next();
});
