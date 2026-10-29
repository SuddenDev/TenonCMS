import { createReadStream } from "node:fs";
import { readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { Readable } from "node:stream";
import { API_BASE } from "../../../client/index.ts";
import { encodeKey, type Storage } from "../types.ts";
import { createDisk } from "./disk.ts";
import { localUploads } from "./uploads.ts";

/** Options of `local()`. */
export type LocalOptions = {
  /** Directory that holds the files. Folders of the media library are folders here. MUST be on a persistent disk. */
  dir: string;
  /** Part size of uploads in bytes. Every part is one request, so it MUST fit the body limit of a reverse proxy. Default 16 MB. */
  partSize?: number;
  /** Public URL of `dir` when the host serves it itself, e.g. `https://cdn.example.com/uploads`. Default: core serves files at `/_tenon/media/files/<key>`. */
  baseUrl?: string;
};

/**
 * Stores media files on the local disk. Needs a persistent filesystem (Node, Bun, Deno); not for Workers or
 * ephemeral serverless filesystems. Uploads are streamed through the server part by part.
 */
export function local({ dir, partSize = 16 * 1024 ** 2, baseUrl }: LocalOptions): Storage {
  const disk = createDisk(dir);
  const { path } = disk;

  return {
    partSize,
    ...localUploads(disk),

    async get(key, range) {
      const file = await disk.exists(path(key));
      if (!file?.isFile()) return undefined;
      const body = Readable.toWeb(createReadStream(path(key), range)) as ReadableStream<Uint8Array>;
      return { body, size: file.size };
    },

    async put(key, data) {
      await disk.parent(path(key));
      await writeFile(path(key), data);
    },

    async list(prefix) {
      // A prefix ends in a folder or in part of a name, so list its folder and filter.
      const folder = prefix.endsWith("/") ? path(prefix) : dirname(path(prefix));
      const entries = await readdir(folder, { recursive: true, withFileTypes: true }).catch(
        () => [],
      );
      return entries
        .filter((e) => e.isFile())
        .map((e) => relative(disk.root, join(e.parentPath, e.name)).split(sep).join("/"))
        .filter((key) => key.startsWith(prefix));
    },

    async move(from, to) {
      if (!(await disk.exists(path(from)))) return;
      await disk.parent(path(to));
      await rename(path(from), path(to));
      await disk.prune(path(from));
    },

    async delete(key) {
      await rm(path(key), { force: true });
      await disk.prune(path(key));
    },

    url: (key) =>
      baseUrl
        ? `${baseUrl.replace(/\/$/, "")}/${encodeKey(key)}`
        : `${API_BASE}/media/files/${encodeKey(key)}`,
  };
}
