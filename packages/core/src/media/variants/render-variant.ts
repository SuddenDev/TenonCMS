import type { Modifiers } from "../../schema/index.ts";
import type { MediaCore } from "../runtime/create-media-core.ts";
import { variantKey } from "./keys.ts";

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
