import type { Core } from "../cms/runtime/types.ts";
import { outerScope } from "../cms/runtime/operation-context.ts";
import type { LocalApi } from "../schema/index.ts";
import { caller } from "../auth/get-caller.ts";
import type { Level } from "./query/visibility.ts";

/**
 * The visibility level and local API of a public read. Reads need no session, so the read routes run before the
 * session middleware and look up the caller here: a session sees private fields, gives hooks its user and, with the
 * preview cookie, reads drafts.
 */
export async function reader(
  core: Core,
  request: Request,
): Promise<{ level: Level; api: LocalApi }> {
  const { user, perspective } = await caller(core.getSession, request);
  return {
    level: user ? "admin" : "public",
    api: core.localApi(outerScope(user, perspective)),
  };
}
