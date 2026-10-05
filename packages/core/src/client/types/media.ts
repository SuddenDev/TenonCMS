import type { MediaRead, MediaUpdate } from "../../schema/index.ts";
import type { UploadOptions } from "./options.ts";

/** The media library over HTTP. Needs `defineCms({ media })`. Writes need a session. */
export type MediaClient = {
  /**
   * Uploads a file in parts, 4 at a time, retrying a failed part 3 times. Returns the media document.
   * `POST /api/cms/media/uploads`, then one `PUT` per part, then `POST /api/cms/media/uploads/:id/complete`.
   */
  upload(file: Blob & { name?: string }, options?: UploadOptions): Promise<MediaRead>;
  /**
   * Changes `alt`, or moves the file with a new `filename` or `folder`.
   * `PATCH /api/cms/media/:id`
   */
  update(id: string, data: MediaUpdate): Promise<MediaRead>;
  /**
   * Moves every file under `from` to `to`. `failed` lists files that did not move; call it again to finish.
   * `POST /api/cms/media/folders/rename`
   */
  renameFolder(
    from: string,
    to: string,
  ): Promise<{ moved: number; failed: { id: string; message: string }[] }>;
  /**
   * Deletes a file. Throws a `CmsError` with status `409` and `references` while a `restrict` field uses it.
   * `DELETE /api/cms/media/:id`
   */
  delete(id: string): Promise<null>;
  /**
   * Brings the stored variants of one file in line with the current image options. `force` re-renders all of them.
   * Throws a `CmsError` with status `404` for a missing file, or when the image provider stores no variants.
   * `POST /api/cms/media/:id/regenerate`
   */
  regenerate(
    id: string,
    options?: {
      /** Re-renders every variant, not only missing ones. */
      force?: boolean;
    },
  ): Promise<{ rendered: number; removed: number }>;
  /**
   * Lists every folder with its parents, sorted. The root is left out.
   * `GET /api/cms/media/folders`
   */
  folders(): Promise<string[]>;
};
