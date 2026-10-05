import type { Core, Scope } from "../../cms/runtime/types.ts";
import { q } from "../../cms/runtime/transaction.ts";
import { loadDoc } from "../../db/queries/documents/load-document.query.ts";
import type { MediaDoc } from "../../schema/index.ts";
import { decorate } from "../images/decorate.ts";
import { mediaOf } from "./create-media-core.ts";

/** The stored media document `id`, without URLs. `undefined` for a missing one. */
export async function loadMedia(core: Core, scope: Scope, id: string) {
  return (await loadDoc(await q(core, scope), "media", id)) as MediaDoc | undefined;
}

/** A media document with `url`, and `src` / `srcset` for images, with the global image options. */
export const readMedia = (core: Core, doc: Record<string, any>) =>
  decorate(mediaOf(core), doc) as MediaDoc & { url: string };
