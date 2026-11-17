import { consola } from "consola";
import { check } from "../../access/rule.ts";
import { inner, outerScope } from "../../cms/runtime/operation-context.ts";
import type { Core, Inner } from "../../cms/runtime/types.ts";
import type { ActionEntry, AdminRuntime } from "../merge/merge-options.ts";
import { ForbiddenError } from "../../errors.ts";
import { notFound } from "../../http/errors.ts";
import { isText } from "../describe/registration-checks.ts";
import type { LocalApi } from "../../schema/index.ts";
import type { ActionDescriptor, CmsUser, Text } from "../index.d.ts";

const ADMINS = ["admin"];

/** Whether the caller of `s` MAY see and run (or follow) `action`. The default rule is admins. */
async function canRunAction(s: Inner, action: ActionEntry | undefined) {
  const rule = action?.access ?? ADMINS;
  return !!(await check(s, rule, { cms: s.cms, user: s.user, context: s.context }));
}

/** The actions the caller of `s` MAY see, links included, for the `/schema` of the admin. */
export async function visibleActions(admin: AdminRuntime, s: Inner) {
  const visible: Record<string, ActionDescriptor> = {};
  for (const [key, descriptor] of Object.entries(admin.descriptor.actions))
    if (await canRunAction(s, admin.actions.get(key))) visible[key] = descriptor;
  return visible;
}

/**
 * Runs action `key` for `user`, with `cms` bound to that user. A throw of `run` is logged and becomes `failed`: only
 * users the action's rule allows get that far, and the admin shows the message in a toast.
 * @returns The text `run` returned for the toast (or `null`), and `failed` when `run` threw.
 * @throws {HTTPException} 404 for an unknown action, a link, or without an admin.
 * @throws {ForbiddenError} 403 when its rule denies the user.
 */
export async function runAction(core: Core, user: CmsUser, cms: LocalApi, key: string) {
  const action = core.admin?.actions.get(key);
  if (!action?.run) throw notFound();
  if (!(await canRunAction(inner(core, outerScope({ user }), undefined, {}), action)))
    throw new ForbiddenError(403);

  try {
    const result = await action.run({ user, cms });
    return { message: isText(result) ? (result as Text) : null, failed: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    consola.withTag("tenon").error(`Action "${key}" of ${action.source} failed: ${message}`);
    return { message, failed: true };
  }
}
