import type { Schema } from "../schema/index.ts";
import { createRequest } from "./create-request.ts";
import { CmsError } from "./errors.ts";
import { readQuery } from "./query/read-query.ts";
import type { Client, ClientOptions, RegisteredCms, Perspective, UploadOptions } from "./types.ts";

type ReadQuery = { populate?: boolean | object; depth?: number; select?: object };

type FindQuery = ReadQuery & { where?: object; limit?: number };

/**
 * Typed HTTP client for `/api/cms`. It has the same methods as the local API, so code reads the same on
 * both sides. Use it in the browser: admin pages, islands, client components. On the server, call the
 * `cms` instance directly.
 *
 * Reads are public. Writes need an admin session cookie, so they work in admin pages.
 *
 * Collection and global names and document types come from the registered `cms`. See {@link Register}.
 * Pass a type argument to override it.
 * @example
 * import { createClient } from 'integral-cms/client'
 *
 * const client = createClient()
 * const posts = await client.find('posts', { where: { featured: true } })
 */
export function createClient<C extends { schema: Schema } = RegisteredCms>({
  baseUrl = "",
  fetch: fetchFn = fetch,
}: ClientOptions = {}): Client<C> {
  const request = createRequest(baseUrl, fetchFn);

  const enc = encodeURIComponent;
  const collection = (name: string) => `/collections/${enc(name)}`;
  const doc = (name: string, id: string) => `${collection(name)}/${enc(id)}`;
  const global = (name: string) => `/globals/${enc(name)}`;
  const user = async (path: string, data: object) => (await request("POST", path, data)).user;

  // The implementation is untyped; `Client` types it for the host.
  const client = {
    find: (name: string, { where, limit, ...read }: FindQuery = {}) =>
      request("GET", collection(name), undefined, {
        ...where,
        ...(limit && { limit }),
        ...readQuery(read),
      }),

    findOne: async (name: string, options: FindQuery) =>
      (await client.find(name, { ...options, limit: 1 }))[0],

    findById: (name: string, id: string, options: ReadQuery = {}) =>
      request("GET", doc(name, id), undefined, readQuery(options)),

    create: (name: string, data: unknown) => request("POST", collection(name), data),

    update: (name: string, id: string, data: unknown) => request("PUT", doc(name, id), data),

    createDraft: (name: string, data: unknown) =>
      request("POST", `${collection(name)}/draft`, data),

    updateDraft: (name: string, id: string, data: unknown) =>
      request("PUT", `${doc(name, id)}/draft`, data),

    publish: (name: string, id: string) => request("POST", `${doc(name, id)}/publish`),

    discard: (name: string, id: string) => request("DELETE", `${doc(name, id)}/draft`),

    delete: (name: string, id: string) => request("DELETE", doc(name, id)),

    getGlobal: (name: string, options: ReadQuery = {}) =>
      request("GET", global(name), undefined, readQuery(options)),

    setGlobal: (name: string, data: unknown) => request("PUT", global(name), data),

    setGlobalDraft: (name: string, data: unknown) => request("PUT", `${global(name)}/draft`, data),

    publishGlobal: (name: string) => request("POST", `${global(name)}/publish`),

    discardGlobal: (name: string) => request("DELETE", `${global(name)}/draft`),

    previewUrl: async (name: string, data: unknown) =>
      (await request("POST", `${collection(name)}/preview-url`, data)).url,

    previewGlobalUrl: async (name: string, data: unknown) =>
      (await request("POST", `${global(name)}/preview-url`, data)).url,

    getSchema: () => request("GET", "/schema"),

    signUp: (data: object) => user("/auth/sign-up/email", data),

    signIn: (data: object) => user("/auth/sign-in/email", data),

    signOut: async () => {
      await request("POST", "/auth/sign-out", {});
    },

    getSession: () => request("GET", "/auth/get-session"),

    request: (
      path: string,
      { method = "GET", body, query } = {} as NonNullable<Parameters<Client["request"]>[1]>,
    ) => request(method, path, body, query),

    media: {
      upload,
      update: (id: string, data: unknown) => request("PATCH", `/media/${enc(id)}`, data),
      renameFolder: (from: string, to: string) =>
        request("POST", "/media/folders/rename", { from, to }),
      delete: (id: string) => request("DELETE", `/media/${enc(id)}`),
      regenerate: (id: string, options: { force?: boolean } = {}) =>
        request("POST", `/media/${enc(id)}/regenerate`, options),
      folders: () => request("GET", "/media/folders"),
    },

    preview: {
      enter: async (perspective: Perspective = "drafts") => {
        await request("POST", "/preview", { perspective });
      },
      exit: async () => {
        await request("DELETE", "/preview");
      },
    },
  };

  // Sends one part. Proxied parts answer `{ etag }`; direct ones (S3) send the `ETag` header.
  // A 4xx other than 408 and 429 is final; anything else is retried 3 times with backoff.
  async function putPart(url: string, blob: Blob, signal?: AbortSignal) {
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      const res = await fetchFn(url.startsWith("/") ? `${baseUrl}${url}` : url, {
        method: "PUT",
        body: blob,
        signal,
      }).catch((error) => {
        if (signal?.aborted || attempt >= 3) throw error;
      });
      if (res?.ok)
        return url.startsWith("/") ? (await res.json()).etag : (res.headers.get("etag") ?? "");
      const final = res && res.status < 500 && res.status !== 408 && res.status !== 429;
      if (res && (final || attempt >= 3))
        throw new CmsError(res.status, await res.json().catch(() => null));
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }

  async function upload(
    file: Blob & { name?: string },
    { folder, filename, onProgress, signal }: UploadOptions = {},
  ) {
    signal?.throwIfAborted();
    const plan = await request("POST", "/media/uploads", {
      folder,
      filename: filename ?? file.name ?? "file",
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    });
    const id = `/media/uploads/${enc(plan.id)}`;
    try {
      const queue = [...plan.parts] as { n: number; url: string }[];
      const parts: { n: number; etag: string }[] = [];
      let loaded = 0;
      const worker = async () => {
        for (let part = queue.shift(); part; part = queue.shift()) {
          const blob = file.slice((part.n - 1) * plan.partSize, part.n * plan.partSize);
          parts.push({ n: part.n, etag: await putPart(part.url, blob, signal) });
          loaded += blob.size;
          onProgress?.({ loaded, total: file.size });
        }
      };
      await Promise.all([1, 2, 3, 4].map(worker));
      signal?.throwIfAborted();
      return await request("POST", `${id}/complete`, { parts });
    } catch (error) {
      await request("DELETE", id).catch(() => {});
      throw error;
    }
  }

  return client as unknown as Client<C>;
}
