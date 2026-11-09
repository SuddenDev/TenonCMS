import { createFileRoute } from "@tanstack/react-router";
import cms from "../../tenon.config";

// Vite hosts mount the CMS's site routes themselves.
export const Route = createFileRoute("/sitemap.xml")({
  server: { handlers: { GET: ({ request }) => cms.fetch(request) } },
});
