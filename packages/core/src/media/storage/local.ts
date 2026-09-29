import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { API_BASE } from "../../client/index.ts";
import { encodeKey, type Storage } from "./types.ts";

export type LocalOptions = {
  /** Directory that holds the files. Folders of the media library are folders here. MUST be on a persistent disk. */
  dir: string;
  /** Part size of uploads in bytes. Every part is one request, so it MUST fit the body limit of a reverse proxy. Default 16 MB. */
  partSize?: number;
  /** Public URL of `dir` when the host serves it itself, e.g. `https://cdn.example.com/uploads`. Default: core serves files at `/api/cms/media/files/<key>`. */
  baseUrl?: string;
};

const exists = (path: string) =>
  stat(path).then(
    (s) => s,
    () => undefined,
  );

/**
 * Stores media files on the local disk. Needs a persistent filesystem (Node, Bun, Deno); not for Workers or
 * ephemeral serverless filesystems. Uploads are streamed through the server part by part.
 */
export function local({ dir, partSize = 16 * 1024 ** 2, baseUrl }: LocalOptions): Storage {
  const root = resolve(dir);
  // Keys are cleaned by core. This keeps a bad key from leaving `dir` anyway.
  const path = (key: string) => {
    const p = resolve(root, key);
    if (!p.startsWith(root + sep)) throw new Error(`Invalid key "${key}"`);
    return p;
  };
  const tmp = (uploadId: string) => path(`.tmp/${uploadId}`);
  const parent = (p: string) => mkdir(dirname(p), { recursive: true });

  // Removes empty folders from `p` up to `root`.
  async function prune(p: string) {
    for (let d = dirname(p); d !== root && d.startsWith(root); d = dirname(d)) {
      try {
        await rmdir(d);
      } catch {
        return;
      }
    }
  }

  return {
    partSize,
    async createUpload() {
      const uploadId = crypto.randomUUID();
      await parent(tmp(uploadId));
      await writeFile(tmp(uploadId), "");
      return { uploadId };
    },
    async putPart(_key, uploadId, n, body, maxBytes) {
      let count = 0;
      const limit = new Transform({
        transform(chunk: Buffer, _, done) {
          count += chunk.length;
          done(count > maxBytes ? new Error("Part too large") : null, chunk);
        },
      });
      const out = createWriteStream(tmp(uploadId), { flags: "r+", start: (n - 1) * maxBytes });
      await pipeline(Readable.fromWeb(body as any), limit, out);
      return { etag: String(n) };
    },
    async complete(key, uploadId) {
      const { size } = await stat(tmp(uploadId));
      await parent(path(key));
      await rename(tmp(uploadId), path(key));
      return { size };
    },
    async abort(_key, uploadId) {
      await rm(tmp(uploadId), { force: true });
    },
    async get(key, range) {
      const file = await exists(path(key));
      if (!file?.isFile()) return undefined;
      const body = Readable.toWeb(createReadStream(path(key), range)) as ReadableStream<Uint8Array>;
      return { body, size: file.size };
    },
    async put(key, data) {
      await parent(path(key));
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
        .map((e) => relative(root, join(e.parentPath, e.name)).split(sep).join("/"))
        .filter((key) => key.startsWith(prefix));
    },
    async move(from, to) {
      if (!(await exists(path(from)))) return;
      await parent(path(to));
      await rename(path(from), path(to));
      await prune(path(from));
    },
    async delete(key) {
      await rm(path(key), { force: true });
      await prune(path(key));
    },
    url: (key) =>
      baseUrl
        ? `${baseUrl.replace(/\/$/, "")}/${encodeKey(key)}`
        : `${API_BASE}/media/files/${encodeKey(key)}`,
  };
}
