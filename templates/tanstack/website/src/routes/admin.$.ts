import { createFileRoute } from "@tanstack/react-router";
import html from "#tenon/admin-html";

// The admin is a page of its own. The app's shell, CSS and JS never load on /admin.
// The route MUST match `admin.path` in tenon.config.ts: rename the file for another path.
export const Route = createFileRoute("/admin/$")({
  server: {
    handlers: {
      GET: () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }),
    },
  },
});
