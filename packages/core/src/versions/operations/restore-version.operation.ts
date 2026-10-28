import type { Core } from "../../cms/runtime/types.ts";
import type { CmsUser } from "../../admin/index.d.ts";
import { outerScope } from "../../cms/runtime/operation-context.ts";
import { type ContentTarget, target, targetKey } from "../../content/targets.ts";
import { findVersion } from "../../db/queries/versions/find-versions.query.ts";
import { versionScope } from "./version-scope.ts";

/**
 * Writes a version back as the draft, or as a save when the target has `drafts: false`, in the version's locale.
 * The write runs the whole pipeline as the user, so it records a new version.
 * @returns The written document or global, or `undefined` when there is no such version.
 * @throws {ForbiddenError} When the user MAY NOT update the target.
 */
export async function restoreVersion(
  core: Core,
  user: CmsUser,
  name: ContentTarget,
  id: string | undefined,
  versionId: string,
) {
  await versionScope(core, user, name, id);
  const version = await findVersion(await core.db(), targetKey(name), id ?? "", versionId);
  if (!version) return undefined;

  const cms = core.localApi(outerScope({ user }));
  const options = {
    draft: target(core, name).drafts !== false,
    locale: version.locale ?? undefined,
  };
  return name.kind === "global"
    ? cms.setGlobal(name.name, version.data, options)
    : cms.update(name.name, id!, version.data, options);
}
