import { ValidationError } from "../../../errors.ts";
import { dimensions } from "../../images/dimensions.ts";
import type { Storage } from "../../storage/types.ts";
import type { Row } from "./upload-row.ts";

// Bytes read for the image header. Some JPEGs carry large metadata before their size.
const HEADER = 1024 ** 2;

/**
 * The document data of an assembled upload, with `width` and `height` for images.
 * @throws {ValidationError} When the stored size differs from the announced one, or an image has no readable header.
 */
export async function fileData(storage: Storage, row: Row, size: number) {
  if (size !== row.size)
    throw new ValidationError({ size: `Received ${size} bytes, expected ${row.size}` });

  const data = {
    folder: row.folder,
    filename: row.filename,
    key: row.key,
    mimeType: row.mime_type,
    size,
  };
  if (!row.mime_type.startsWith("image/")) return data;

  const head = await storage.get(row.key, { start: 0, end: Math.min(size, HEADER) - 1 });
  const found = head && dimensions(await new Response(head.body).bytes());
  if (!found) throw new ValidationError({ "": "Not a valid image" });

  return { ...data, ...found };
}
