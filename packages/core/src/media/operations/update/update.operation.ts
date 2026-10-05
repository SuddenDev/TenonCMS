import { col } from "../../../content/targets.ts";
import type { Core, Inner, Scope } from "../../../cms/runtime/types.ts";
import { transaction } from "../../../cms/runtime/transaction.ts";
import { write } from "../../../content/writes/write-document.ts";
import type { MediaDoc, MediaUpdate } from "../../../schema/index.ts";
import { mediaOf } from "../../runtime/create-media-core.ts";
import { loadMedia, readMedia } from "../../runtime/read-media.ts";
import { runMediaHooks } from "../../runtime/run-media-hooks.ts";
import { moveBack, moveFile } from "./move-file.ts";
import { placeOf } from "./place.ts";

/**
 * `cms.media.update()`: `alt` runs the change hooks; a new `filename` or `folder` moves the file.
 * A move never renames on a collision: a taken name is 400 `Already used`.
 * Storage moves before the document write; a failed transaction moves the file back.
 */
export async function update(core: Core, scope: Scope, id: string, input: MediaUpdate) {
  const { storage } = mediaOf(core);
  const original = await loadMedia(core, scope, id);
  if (!original) return undefined;

  const place = placeOf(original, input);
  const move = place.key === original.key ? undefined : { from: original.key, to: place.key };
  const altChanged = input.alt !== undefined;
  let moved = false;

  // ponytail: two concurrent moves of the same file are not locked. Add a per-document lock if editors collide.
  try {
    const doc = await transaction(core, scope, async (s) => {
      const data: Record<string, unknown> = { ...original };
      if (altChanged) data.alt = await changeAlt(core, s, original, input.alt);

      if (move) {
        await moveFile(core, s, original, place);
        moved = true;
        Object.assign(data, place);
      }

      const doc = (await write(core, s, col("media"), "update", data, { id }))!;
      if (move) await runMediaHooks(core, s, "afterMove", "doc", doc, move);
      if (altChanged)
        await runMediaHooks(core, s, "afterChange", "doc", doc, { previousDoc: original });
      return doc;
    });
    return readMedia(core, doc);
  } catch (error) {
    if (moved) await moveBack(storage, move!);
    throw error;
  }
}

// Runs `beforeChange` on the new `alt` and returns the value to store.
async function changeAlt(core: Core, s: Inner, original: MediaDoc, alt: MediaUpdate["alt"]) {
  const extra = { originalDoc: original };
  const changed = await runMediaHooks(core, s, "beforeChange", "data", { alt }, extra);
  return changed.alt;
}
