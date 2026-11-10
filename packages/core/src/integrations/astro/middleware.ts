import { defineMiddleware } from "astro:middleware";
import cms from "#tenon/config";
import { API_BASE, localeFromPath } from "tenoncms/client";
import { startJobsInterval } from "./jobs-interval.ts";

declare const __TENON_JOBS__: boolean;

let jobsStarted = false;

/**
 * Sets `Astro.locals.tenon` to the instance of the request's user, in the drafts perspective inside the
 * admin's preview. Prerendered pages and `/_tenon` get the plain instance: the first have no request headers,
 * and the API looks up the session itself.
 * Sets `locals.locale` and `locals.path` (the path without the locale prefix) from the URL. Without `localization`
 * or with `routing: false`, `path` is the pathname and `locale` the default locale, if any.
 * Starts the job clock on the first request that is not prerendered, where the integration turned it on.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  if (__TENON_JOBS__ && !jobsStarted && !context.isPrerendered) {
    jobsStarted = true;
    startJobsInterval(cms);
  }
  context.locals.tenon =
    context.isPrerendered || context.url.pathname.startsWith(API_BASE)
      ? cms
      : await cms.withSession(context.request);
  const { pathname } = context.url;
  Object.assign(
    context.locals,
    cms.localization
      ? localeFromPath(pathname, cms.localization)
      : { locale: undefined, path: pathname },
  );
  return next();
});
