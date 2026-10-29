import { defineMiddleware } from "astro:middleware";
import cms from "#tenon/config";
import { API_BASE, localeFromPath } from "tenoncms/client";

/**
 * Sets `Astro.locals.tenon` to the instance of the request's user, in the drafts perspective inside the
 * admin's preview. Prerendered pages and `/_tenon` get the plain instance: the first have no request headers,
 * and the API looks up the session itself.
 * Sets `locals.locale` and `locals.path` (the path without the locale prefix) from the URL. Without `localization`
 * or with `routing: false`, `path` is the pathname and `locale` the default locale, if any.
 */
export const onRequest = defineMiddleware(async (context, next) => {
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
