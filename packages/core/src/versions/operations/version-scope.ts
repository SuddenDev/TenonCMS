import type { Core } from "../../cms/runtime/types.ts";
import type { CmsUser } from "../../admin/index.d.ts";
import { inner, outerScope } from "../../cms/runtime/operation-context.ts";
import { guard } from "../../access/rule.ts";
import type { ContentTarget } from "../../content/targets.ts";
import { withLocale } from "../../content/locale.ts";

/**
 * The scope of a history call. The history is an editing tool, so it needs the `update` rule.
 * @throws {ForbiddenError} When the user MAY NOT update the target.
 * @throws {ValidationError} For an unknown locale.
 */
export async function versionScope(
  core: Core,
  user: CmsUser,
  name: ContentTarget,
  id: string | undefined,
  locale?: string,
) {
  const scope = inner(core, withLocale(core, outerScope({ user }), { locale }), undefined, {});
  await guard(core, scope, name, "update", { id });
  return scope;
}
