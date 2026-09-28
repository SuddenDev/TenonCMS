import { createFileRoute } from "@tanstack/react-router";
import html from "#integral/admin-html";

// The admin is a page of its own. The app's shell, CSS and JS never load on /admin.
export const Route = createFileRoute("/admin/$")({
  server: {
    handlers: {
      GET: () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }),
    },
  },
});
