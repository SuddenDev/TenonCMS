import type { Core } from "../../cms/runtime/types.ts";
import type { CmsUser } from "../../admin/index.d.ts";
import { type ContentTarget, target, targetKey } from "../../content/targets.ts";
import { locOf } from "../../content/reads/loc-of.ts";
import { findVersions } from "../../db/queries/versions/find-versions.query.ts";
import { versionScope } from "./version-scope.ts";

/**
 * The versions of a document, or of a global without `id`, in `locale` (default: the default locale).
 * @throws {ForbiddenError} When the user MAY NOT update the target.
 */
export async function listVersions(
  core: Core,
  user: CmsUser,
  name: ContentTarget,
  id: string | undefined,
  locale?: string,
) {
  const scope = await versionScope(core, user, name, id, locale);
  const loc = locOf(core, scope, target(core, name));
  return findVersions(await core.db(), targetKey(name), id ?? "", loc?.locale ?? null);
}
