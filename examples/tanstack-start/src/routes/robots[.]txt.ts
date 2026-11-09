import { createFileRoute } from "@tanstack/react-router";
import cms from "../../tenon.config";

export const Route = createFileRoute("/robots.txt")({
  server: { handlers: { GET: ({ request }) => cms.fetch(request) } },
});
