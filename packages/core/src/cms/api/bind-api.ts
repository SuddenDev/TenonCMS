import type { LocalApi } from "../../schema/hooks/index.ts";
import { mediaApi } from "../../media/api.ts";
import { read } from "../../content/reads/read-documents.ts";
import { readGlobal } from "../../content/reads/read-global.ts";
import { run } from "../../content/lifecycle/run-operation.ts";
import { ValidationError } from "../../errors.ts";
import { col, draftable, glob, known } from "../../content/targets.ts";
import { type Core, type Scope } from "../runtime/types.ts";
import { create } from "../../collections/operations/create.operation.ts";
import { discard } from "../../content/writes/discard-draft.ts";
import { publish } from "../../content/writes/publish-document.ts";
import { remove } from "../../content/writes/remove-document.ts";
import { setGlobal } from "../../globals/operations/set.operation.ts";
import { update } from "../../collections/operations/update.operation.ts";

// Media documents change only through `cms.media`.
function writable(core: Core, collection: string) {
  known(core, "collection", collection);
  if (collection === "media")
    throw new ValidationError({ "": "Media documents change only through the media API" });
}

/** The local API of one scope. The implementation is untyped; `Api` types it for the host. */
export function bind(core: Core, scope: Scope): LocalApi {
  return {
    async find(collection, options = {}) {
      known(core, "collection", collection);
      return run(core, scope, "read", col(collection), { collection, options }, (s, args) =>
        read(core, s, collection, args.options),
      );
    },
    async findOne(collection, options) {
      known(core, "collection", collection);
      return run(
        core,
        scope,
        "read",
        col(collection),
        { collection, options },
        async (s, args) => (await read(core, s, collection, { ...args.options, limit: 1 }))[0],
      );
    },
    async findById(collection, id, options = {}) {
      known(core, "collection", collection);
      return run(
        core,
        scope,
        "read",
        col(collection),
        { collection, id, options },
        async (s, args) => (await read(core, s, collection, { ...args.options, id: args.id }))[0],
      );
    },
    async create(collection, data, { draft = false } = {}) {
      writable(core, collection);
      if (draft) draftable(core, col(collection));
      return (await create(core, scope, collection, data, draft))!;
    },
    async update(collection, id, data, { draft = false } = {}) {
      writable(core, collection);
      if (draft) draftable(core, col(collection));
      return update(core, scope, collection, id, data, { draft });
    },
    async publish(collection, id) {
      writable(core, collection);
      return publish(core, scope, col(collection), id);
    },
    async discard(collection, id) {
      writable(core, collection);
      draftable(core, col(collection));
      return discard(core, scope, col(collection), id);
    },
    async delete(collection, id) {
      writable(core, collection);
      await run(core, scope, "delete", col(collection), { collection, id }, (s, args) =>
        remove(core, s, collection, args.id),
      );
    },
    async getGlobal(name, options = {}) {
      known(core, "global", name);
      return run(core, scope, "getGlobal", glob(name), { global: name, options }, (s, args) =>
        readGlobal(core, s, name, args.options),
      );
    },
    async setGlobal(name, data, { draft = false } = {}) {
      known(core, "global", name);
      if (draft) draftable(core, glob(name));
      return (await setGlobal(core, scope, name, data, { draft }))!;
    },
    async publishGlobal(name) {
      known(core, "global", name);
      return (await publish(core, scope, glob(name)))!;
    },
    async discardGlobal(name) {
      known(core, "global", name);
      draftable(core, glob(name));
      return (await discard(core, scope, glob(name)))!;
    },
    drafts: () => core.bind({ ...scope, drafts: true }),
    media: core.media && mediaApi(core, scope),
  };
}
