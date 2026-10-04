import type { Core } from "../../cms/runtime/types.ts";
import { mediaByKey } from "../../db/queries/media/media-by-key.query.ts";

export const docOf = async (core: Core, key: string) =>
  key.startsWith(".") ? undefined : mediaByKey(await core.db(), key);
