import html from "#integral/admin-html";
import cms from "./integral.config";

// Headless: the API under /api/cms, the admin under /admin, nothing else.
export default {
  fetch(request: Request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/") return Response.redirect(new URL("/admin", request.url), 302);
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return cms.fetch(request);
  },
};
