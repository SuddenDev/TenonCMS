import { consola } from "consola";
import type { MediaCore } from "../runtime/create-media-core.ts";
import { renderVariant } from "./render-variant.ts";

const log = consola.withTag("integral");

/** Renders the variants `ids` of the file `key` and returns how many succeeded. A failure is logged. */
export async function renderAll(media: MediaCore, key: string, ids: Iterable<string>) {
  let rendered = 0;
  for (const id of ids) {
    try {
      await renderVariant(media, key, media.allowlist.get(id)!, id);
      rendered++;
    } catch (error) {
      log.error(`Rendering ${id} of ${key} failed`, error);
    }
  }
  return rendered;
}
