import { createFileRoute } from "@tanstack/react-router";
import cms from "../../tenon.config";

const handle = ({ request }: { request: Request }) => cms.fetch(request);

export const Route = createFileRoute("/_tenon/$")({
  server: { handlers: { GET: handle, POST: handle, PUT: handle, DELETE: handle } },
});
