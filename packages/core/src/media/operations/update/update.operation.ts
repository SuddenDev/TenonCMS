import { collectionTarget } from "../../../content/targets.ts";
import type { Core, Inner, Scope } from "../../../cms/runtime/types.ts";
import { transaction } from "../../../cms/runtime/transaction.ts";
import { writeDocument } from "../../../content/writes/write-document.ts";
import type { MediaDoc, MediaUpdate } from "../../../schema/index.ts";
import { loadMedia, readMedia } from "../../runtime/read-media.ts";
import { runMediaHooks } from "../../runtime/run-media-hooks.ts";
import { moveFile } from "./move-file.ts";
import { placeOf } from "./place.ts";

/**
 * `cms.media.update()`: `alt` runs the change hooks; a new `filename` or `folder` moves the file.
 * A move never renames on a collision: a taken name is 400 `Already used`.
 * Storage moves before the document write; a failed transaction moves the file back.
 */
export async function update(core: Core, scope: Scope, id: string, input: MediaUpdate) {
  // shortcut: concurrent moves are not locked, add a per-document lock if editors collide.
  const doc = await transaction(core, scope, async (scope) => {
    const original = await loadMedia(core, scope, id);
    if (!original) return undefined;
    const place = placeOf(original, input);
    const move = place.key === original.key ? undefined : { from: original.key, to: place.key };
    const altChanged = input.alt !== undefined;
    const data: Record<string, unknown> = { ...original };
    if (altChanged) data.alt = await changeAlt(core, scope, original, input.alt);

    if (move) {
      await moveFile(core, scope, original, place);
      Object.assign(data, place);
    }

    const doc = (await writeDocument(core, scope, {
      target: collectionTarget("media"),
      operation: "update",
      input: data,
      id,
    }))!;
    if (move) await runMediaHooks(core, scope, "afterMove", "doc", doc, move);
    if (altChanged)
      await runMediaHooks(core, scope, "afterChange", "doc", doc, { previousDoc: original });
    return doc;
  });
  return doc && readMedia(core, doc);
}
// Runs `beforeChange` on the new `alt` and returns the value to store.
async function changeAlt(core: Core, scope: Inner, original: MediaDoc, alt: MediaUpdate["alt"]) {
  const extra = { originalDoc: original };
  const changed = await runMediaHooks(core, scope, "beforeChange", "data", { alt }, extra);
  return changed.alt;
}
