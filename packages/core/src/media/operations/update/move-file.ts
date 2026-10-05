import { consola } from "consola";
import type { Core, Inner } from "../../../cms/runtime/types.ts";
import type { MediaDoc } from "../../../schema/index.ts";
import { mediaOf } from "../../runtime/create-media-core.ts";
import { runMediaHooks } from "../../runtime/run-media-hooks.ts";
import type { Storage } from "../../storage/types.ts";
import { moveWithVariants } from "../../variants/move-variants.ts";
import { type Place, checkFree } from "./place.ts";

const log = consola.withTag("integral");

/**
 * Moves the file of `original` and its variants to `place`, after the name check and `beforeMove`.
 * @throws {ValidationError} When another file in the folder has the name.
 */
export async function moveFile(core: Core, s: Inner, original: MediaDoc, place: Place) {
  const move = { from: original.key, to: place.key };
  await checkFree(s.trx!, place, original);
  await runMediaHooks(core, s, "beforeMove", "doc", original, move);
  await moveWithVariants(mediaOf(core).storage, move.from, move.to);
}

/** Undoes a move after a failed transaction. A failure is logged; the document still points to `from`. */
export async function moveBack(storage: Storage, { from, to }: { from: string; to: string }) {
  await moveWithVariants(storage, to, from).catch((e) =>
    log.error(`Moving "${to}" back to "${from}" failed. The document points to "${from}".`, e),
  );
}
