import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import cms from "#integral/config";
import { localeFromPath } from "integral-cms/client";
import { createObjectClient } from "integral-cms/cloudflare";

// No object exists at build time.
const prerendered = {
  fetch: () =>
    Promise.reject(
      new Error(
        "integral-cms: on Cloudflare, a page that reads the CMS MUST NOT be prerendered. Set `output: 'server'` or " +
          "`export const prerender = false`.",
      ),
    ),
};

/**
 * Sets `Astro.locals.integral` to the HTTP client over the CMS object. It forwards the request's cookie, so the
 * session user's access rules and the preview cookie's drafts apply. Prerendered pages get a client that throws.
 * Sets `locals.locale` and `locals.path` like the Node middleware.
 */
export const onRequest = defineMiddleware((context, next) => {
  const stub = context.isPrerendered ? prerendered : env.CMS.getByName("cms");
  context.locals.integral = createObjectClient(context.request, stub) as never;
  const { pathname } = context.url;
  Object.assign(
    context.locals,
    cms.localization
      ? localeFromPath(pathname, cms.localization)
      : { locale: undefined, path: pathname },
  );
  return next();
});
