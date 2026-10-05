import { defineMiddleware } from "astro:middleware";
import cms from "#integral/config";
import { API_BASE } from "integral-cms/client";

/**
 * Sets `Astro.locals.integral` to the instance of the request's user, in the drafts perspective inside the
 * admin's preview. Prerendered pages and `/api/cms` get the plain instance: the first have no request headers,
 * and the API looks up the session itself.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.integral =
    context.isPrerendered || context.url.pathname.startsWith(API_BASE)
      ? cms
      : await cms.withSession(context.request);
  return next();
});
