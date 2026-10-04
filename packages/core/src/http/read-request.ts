import type { Cms } from "../cms/create-cms.ts";
import type { Schema } from "../schema/index.ts";
import { caller } from "../auth/get-caller.ts";
import type { Level } from "./query/visibility.ts";

// Reads are public. A session sees private fields, and with the preview cookie reads drafts.
export async function reader(
  cms: Cms<Schema>,
  request: Request,
): Promise<{ level: Level; api: Cms<Schema> }> {
  const { user, drafts } = await caller(
    async (headers) => (await cms.auth()).api.getSession({ headers }),
    request,
  );
  return {
    level: user ? "admin" : "public",
    api: drafts ? cms.drafts() : cms,
  };
}
