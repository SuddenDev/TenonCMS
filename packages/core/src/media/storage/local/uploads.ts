import { createWriteStream } from "node:fs";
import { rename, rm, stat, writeFile } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Storage } from "../types.ts";
import type { Disk } from "./disk.ts";

type Uploads = Pick<Storage, "createUpload" | "putPart" | "complete" | "abort">;

/**
 * Uploads streamed through the server. Every part is written into one temp file under `.tmp/` at its offset, so parts
 * MAY come out of order. Completion renames the temp file to its key.
 */
export function localUploads(disk: Disk): Uploads {
  const tmp = (uploadId: string) => disk.path(`.tmp/${uploadId}`);

  return {
    async createUpload() {
      const uploadId = crypto.randomUUID();
      await disk.parent(tmp(uploadId));
      await writeFile(tmp(uploadId), "");
      return { uploadId };
    },
    async putPart(_key, uploadId, n, body, maxBytes) {
      const out = createWriteStream(tmp(uploadId), { flags: "r+", start: (n - 1) * maxBytes });
      await pipeline(Readable.fromWeb(body as any), limit(maxBytes), out);
      return { etag: String(n) };
    },
    async complete(key, uploadId) {
      const { size } = await stat(tmp(uploadId));
      await disk.parent(disk.path(key));
      await rename(tmp(uploadId), disk.path(key));
      return { size };
    },
    async abort(_key, uploadId) {
      await rm(tmp(uploadId), { force: true });
    },
  };
}

// Fails the stream once more than `maxBytes` pass, so a part never overwrites the next one.
function limit(maxBytes: number) {
  let count = 0;
  return new Transform({
    transform(chunk: Buffer, _, done) {
      count += chunk.length;
      done(count > maxBytes ? new Error("Part too large") : null, chunk);
    },
  });
}
