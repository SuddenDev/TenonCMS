import type { Core, Inner } from "../../../cms/runtime/types.ts";
import type { UploadInfo } from "../../../schema/index.ts";
import { namesIn } from "../../library/names-in.ts";
import { cleanFolder, cleanName, freeName } from "../../library/names.ts";
import { runMediaHooks } from "../../runtime/run-media-hooks.ts";

/** The cleaned folder and filename of upload input. */
export const cleanPlace = (info: Partial<UploadInfo>) => ({
  folder: cleanFolder(String(info.folder ?? "")),
  filename: cleanName(String(info.filename ?? "")),
});

/**
 * Runs `beforeUpload`, then cleans the place it returns. A taken filename gets a suffix: `hero-1.jpg`.
 * @returns The folder and a filename no other file or unfinished upload in it uses.
 */
export async function placeFile(core: Core, s: Inner, info: UploadInfo) {
  const hooked = await runMediaHooks(core, s, "beforeUpload", "data", info);
  const { folder, filename } = cleanPlace(hooked);
  return {
    folder,
    filename: freeName(await namesIn(core, s, folder), filename),
  };
}
