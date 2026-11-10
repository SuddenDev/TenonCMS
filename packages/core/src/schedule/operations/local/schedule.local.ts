import { writable } from "../../../collections/operations/local/check-writable.ts";
import type { LocalApi } from "../../../cms/api/local-api.ts";
import type { Core, Scope } from "../../../cms/runtime/types.ts";
import { collectionTarget, globalTarget, known } from "../../../content/targets.ts";
import { scheduleJob } from "../schedule.operation.ts";

export const scheduleLocal =
  (core: Core, scope: Scope): LocalApi["schedule"] =>
  async (collection, id, options) => {
    writable(core, collection);
    return scheduleJob(core, scope, collectionTarget(collection), id, options);
  };

export const scheduleGlobalLocal =
  (core: Core, scope: Scope): LocalApi["scheduleGlobal"] =>
  async (name, options) => {
    known(core, "global", name);
    return (await scheduleJob(core, scope, globalTarget(name), undefined, options))!;
  };
