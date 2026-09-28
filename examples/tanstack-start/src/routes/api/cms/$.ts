import { createFileRoute } from "@tanstack/react-router";
import cms from "../../../../integral.config";

const handle = ({ request }: { request: Request }) => cms.fetch(request);

export const Route = createFileRoute("/api/cms/$")({
  server: { handlers: { GET: handle, POST: handle, PUT: handle, DELETE: handle } },
});
