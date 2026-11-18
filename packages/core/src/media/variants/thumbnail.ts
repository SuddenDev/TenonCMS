import { API_BASE } from "../../client/constants.ts";
import { ValidationError } from "../../errors.ts";
import { dimensions } from "../images/dimensions.ts";
import { encodeKey } from "../storage/types.ts";

// Without `media.images`, the admin makes a small thumbnail of each raster image in the browser and stores it as a variant.

/** The variant id of a file's admin thumbnail. */
export const THUMBNAIL = "thumbnail";

/** The largest thumbnail in bytes. */
export const THUMBNAIL_MAX_BYTES = 200 * 1024;

const MAX_SIDE = 1024;
const INVALID = "A thumbnail must be a WebP or JPEG of at most 200 KB and 1024 px per side";

/** The URL that serves the thumbnail of `key`, or redirects to the original while there is none. */
export const thumbnailUrl = (key: string) => `${API_BASE}/media/thumbnail/${encodeKey(key)}`;

/** `image/webp` or `image/jpeg` from the first bytes, or `undefined` for anything else. */
export function thumbnailType(bytes: Uint8Array) {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return undefined;
}

/**
 * Checks a thumbnail from the browser before it is stored.
 * @throws {ValidationError} Unless it is a WebP or JPEG of at most 200 KB and 1024 px per side.
 */
export function validateThumbnail(bytes: Uint8Array) {
  const size = bytes.length <= THUMBNAIL_MAX_BYTES ? dimensions(bytes) : undefined;
  if (!size || !thumbnailType(bytes) || size.width > MAX_SIDE || size.height > MAX_SIDE)
    throw invalidThumbnail();
}

export const invalidThumbnail = () => new ValidationError({ "": INVALID });
