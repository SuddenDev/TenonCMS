import { consola } from "consola";
import type { Modifiers } from "../../schema/index.ts";
import type { MediaCore } from "../runtime/create-media-core.ts";
import { variantKey } from "./keys.ts";

const log = consola.withTag("tenon");

/** Renders one variant of the file `key` and stores it. Returns the rendered bytes. */
export async function renderVariant(
  media: MediaCore,
  key: string,
  modifiers: Modifiers,
  id: string,
) {
  const rendered = await media.images!.provider.render!(key, modifiers, media.storage);
  await media.storage.put(variantKey(key, id), rendered.data, rendered.mimeType);
  return rendered;
}

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
