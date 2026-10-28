import type { Core } from "../../cms/runtime/types.ts";
import type { CmsUser } from "../../admin/index.d.ts";
import { type ContentTarget, targetKey } from "../../content/targets.ts";
import { afterRead } from "../../content/lifecycle/run-read-hooks.ts";
import { findVersion } from "../../db/queries/versions/find-versions.query.ts";
import { versionScope } from "./version-scope.ts";

/**
 * One version with its data, after the read hooks. Fields the user MAY NOT read are removed.
 * @returns The version, or `undefined` when the document or global has no such version.
 * @throws {ForbiddenError} When the user MAY NOT update the target.
 */
export async function getVersion(
  core: Core,
  user: CmsUser,
  name: ContentTarget,
  id: string | undefined,
  versionId: string,
) {
  const scope = await versionScope(core, user, name, id);
  const version = await findVersion(await core.db(), targetKey(name), id ?? "", versionId);
  if (!version) return undefined;

  const operation = name.kind === "global" ? "getGlobal" : "read";
  const draft = version.status === "draft";
  const [data] = await afterRead(core, scope, name, [version.data], operation, draft);
  return { ...version, data };
}
