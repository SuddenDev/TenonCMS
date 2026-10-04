import type { Core, Scope } from "../../../cms/runtime/types.ts";
import { q } from "../../../cms/runtime/transaction.ts";
import { DAY } from "./upload-data.ts";

/** The upload `id` of the scope's user, or `undefined` for an unknown, expired or foreign one. */
export async function uploadOf(core: Core, scope: Scope, id: string) {
  const row = await (
    await q(core, scope)
  )
    .selectFrom("cms_uploads")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  const mine = row && row.user_id === (scope.user?.id ?? null);
  return mine && row.created_at > Date.now() - DAY ? row : undefined;
}
