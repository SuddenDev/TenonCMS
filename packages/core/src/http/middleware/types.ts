import type { CmsUser } from "../../admin/index.d.ts";
import type { ApiKeyCaller } from "../../api-keys/types.ts";
import type { Perspective } from "../../cms/runtime/types.ts";
import type { LocalApi } from "../../schema/index.ts";

/**
 * `cms` is the local API for the request's caller. `optionalSession` sets it with the session's user or API key and
 * sets `perspective`; routes before it get `cms` without a user. `user` is set only for a request with a session,
 * `apiKey` only for one with an API key.
 */
export type Env = {
  Variables: { cms: LocalApi; user: CmsUser; apiKey?: ApiKeyCaller; perspective: Perspective };
};
