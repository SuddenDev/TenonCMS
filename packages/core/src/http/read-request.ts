import type { Core } from "../cms/runtime/types.ts";
import { outerScope } from "../cms/runtime/operation-context.ts";
import type { LocalApi } from "../schema/index.ts";
import { caller } from "../auth/get-caller.ts";
import type { Visibility } from "./visibility.ts";

/**
 * Looks up the caller of a public read. Read routes run before the session middleware, because reads need no
 * session. A session sees private fields and gives hooks its user; with the preview cookie it also reads drafts.
 * @returns The caller's visibility and the local API scoped to the caller.
 */
export async function readRequest(
  core: Core,
  request: Request,
): Promise<{ visibility: Visibility; api: LocalApi }> {
  const { user, perspective } = await caller(core.getSession, request);
  return {
    visibility: user ? "admin" : "public",
    api: core.localApi(outerScope(user, perspective)),
  };
}
