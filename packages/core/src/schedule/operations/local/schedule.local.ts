import { requireWritableCollection } from "../../../collections/operations/local/check-writable.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import type { Core, Scope } from "../../../cms/runtime/types.ts";
import { collectionTarget, globalTarget, requireKnownTarget } from "../../../content/targets.ts";
import { scheduleJob } from "../schedule.operation.ts";

export const scheduleLocal =
  (core: Core, scope: Scope): LocalApi["schedule"] =>
  async (collection, id, options) => {
    requireWritableCollection(core, collection);
    return scheduleJob(core, scope, collectionTarget(collection), id, options);
  };

export const scheduleGlobalLocal =
  (core: Core, scope: Scope): LocalApi["scheduleGlobal"] =>
  async (name, options) => {
    requireKnownTarget(core, "global", name);
    return (await scheduleJob(core, scope, globalTarget(name), undefined, options))!;
  };
