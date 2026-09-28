import { resolveRedirect } from "integral-cms/plugins/redirects";
import { defineMiddleware } from "astro:middleware";
import cms from "../integral.config";

// Redirects from the `redirects` collection, before any page renders.
export const onRequest = defineMiddleware(async (context, next) => {
  const redirect = await resolveRedirect(cms, context.url.pathname);
  return redirect ? context.redirect(redirect.to, redirect.status) : next();
});
