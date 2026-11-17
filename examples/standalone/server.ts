import html from "#tenon/admin-html";
import cms from "./tenon.config";

// `tenonAdmin()` fails with `admin: false`, so the config has an admin path.
const admin = cms.adminPath!;

// Headless: the API under /_tenon, the admin under `admin.path`, nothing else.
export default {
  fetch(request: Request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/") return Response.redirect(new URL(admin, request.url), 302);
    if (pathname === admin || pathname.startsWith(`${admin}/`)) {
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return cms.fetch(request);
  },
};
