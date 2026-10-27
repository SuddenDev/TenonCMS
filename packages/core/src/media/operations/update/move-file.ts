import type { Core, Inner } from "../../../cms/runtime/types.ts";
import type { MediaDoc } from "../../../schema/index.ts";
import { onRollback } from "../../../cms/runtime/transaction.ts";
import { mediaOf } from "../../runtime/create-media-core.ts";
import { runMediaHooks } from "../../runtime/run-media-hooks.ts";
import { moveVariants, moveWithVariants } from "../../variants/move-variants.ts";
import { type Place, checkFree } from "./place.ts";

/**
 * Moves the file of `original` and its variants to `place`, after the name check and `beforeMove`.
 * @throws {ValidationError} When another file in the folder has the name.
 */
export async function moveFile(core: Core, s: Inner, original: MediaDoc, place: Place) {
  const move = { from: original.key, to: place.key };
  await checkFree(core, s, place, original);
  await runMediaHooks(core, s, "beforeMove", "doc", original, move);
  const { storage } = mediaOf(core);
  await storage.move(move.from, move.to);
  onRollback(s, () => moveWithVariants(storage, move.to, move.from));
  await moveVariants(storage, move.from, move.to);
}
