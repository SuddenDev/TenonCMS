import { imageSize } from "image-size";

/** Width and height from an image header, or `undefined` for bytes that are not a readable image. */
export function dimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  try {
    const { width, height } = imageSize(bytes);
    return width && height ? { width, height } : undefined;
  } catch {
    return undefined;
  }
}
