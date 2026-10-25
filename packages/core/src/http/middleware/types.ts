import type { CmsUser } from "../../admin/index.d.ts";
import type { LocalApi } from "../../schema/index.ts";

/** `cms` is the local API for the request's caller. `user` is set only behind the session middleware. */
export type Env = { Variables: { cms: LocalApi; user: CmsUser } };
