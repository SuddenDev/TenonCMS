import { client } from "@/shared/api";

// Without an image provider, the admin makes small previews in the browser, so the grid does not load originals.

const SHORT_SIDE = 320;
const LONG_SIDE = 1024;

/** The size of a thumbnail: the short side at 320 px, the long side at most 1024 px, never larger than the image. */
export function thumbnailSize(width: number, height: number) {
  const scale = Math.min(
    1,
    SHORT_SIDE / Math.min(width, height),
    LONG_SIDE / Math.max(width, height),
  );
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Makes and stores the thumbnail of an image.
 * @returns Whether it was stored. `false` when the browser cannot decode the image, e.g. HEIC, or the upload fails; the
 * grid shows the original then.
 */
export async function storeThumbnail(id: string, source: Blob) {
  const thumbnail = await createThumbnail(source).catch(() => undefined);
  if (!thumbnail) return false;
  return client.media.setThumbnail(id, thumbnail).then(
    () => true,
    () => false,
  );
}

// WebP keeps transparency. Browsers without a WebP encoder get JPEG on white.
async function createThumbnail(source: Blob) {
  const bitmap = await createImageBitmap(source);
  try {
    const { width, height } = thumbnailSize(bitmap.width, bitmap.height);
    const draw = (background?: string) => {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d")!;
      context.imageSmoothingQuality = "high";
      if (background) {
        context.fillStyle = background;
        context.fillRect(0, 0, width, height);
      }
      context.drawImage(bitmap, 0, 0, width, height);
      return canvas;
    };
    const webp = await draw().convertToBlob({ type: "image/webp", quality: 0.8 });
    if (webp.type === "image/webp") return webp;
    return draw("#fff").convertToBlob({ type: "image/jpeg", quality: 0.8 });
  } finally {
    bitmap.close();
  }
}
