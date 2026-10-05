import { ValidationError } from "../../../errors.ts";
import type { UploadInfo } from "../../../schema/index.ts";
import { accepts } from "../../library/names.ts";
import type { MediaCore } from "../../runtime/create-media-core.ts";

/**
 * Checks the announced size and type of an upload against the `media` options.
 * @returns The checked size and type.
 * @throws {ValidationError} For a size or type the options reject.
 */
export function checkFile(media: MediaCore, { size, mimeType }: Partial<UploadInfo>) {
  if (!Number.isSafeInteger(size) || size! < 1)
    throw new ValidationError({ size: "MUST be a positive number of bytes" });
  if (size! > media.maxSize)
    throw new ValidationError({ size: `Larger than ${media.maxSize} bytes` });

  if (typeof mimeType !== "string" || !/^[\w.+-]+\/[\w.+-]+$/.test(mimeType))
    throw new ValidationError({ mimeType: "Invalid type" });
  if (!accepts(media.accept, mimeType)) throw new ValidationError({ mimeType: "Type not allowed" });

  return { size: size!, mimeType };
}
