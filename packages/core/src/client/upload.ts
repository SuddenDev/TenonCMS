import type { Request } from "./create-request.ts";
import { CmsError } from "./errors.ts";
import type { UploadOptions } from "./types/index.ts";

type Part = { n: number; url: string };
type Plan = { id: string; partSize: number; parts: Part[] };

/** What sending parts needs from one client. */
export type Uploader = {
  request: Request;
  baseUrl: string;
  fetchFn: typeof fetch;
  /** Headers for proxied parts. Direct parts (S3) MUST NOT get them. */
  auth: Record<string, string>;
};

/**
 * Binds `client.media.upload()` to one client. Retries, progress and cancellation stay within that client.
 * @returns `upload(file, options)`, which resolves to the media document.
 */
export function createUpload(uploader: Uploader) {
  return async function upload(
    file: Blob & { name?: string },
    { folder, filename, onProgress, signal }: UploadOptions = {},
  ) {
    signal?.throwIfAborted();
    const plan = await uploader.request("POST", "/media/uploads", {
      folder,
      filename: filename ?? file.name ?? "file",
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    });
    const path = `/media/uploads/${encodeURIComponent(plan.id)}`;
    return sendFile(uploader, path, file, plan, { onProgress, signal }, (parts) =>
      uploader.request("POST", `${path}/complete`, { parts }),
    );
  };
}

/**
 * Sends the parts of `file` as `plan` lists them, 4 at a time, then calls `finish` with their ETags. A failed or
 * aborted upload is deleted at `path`, which drops its parts in storage.
 */
export async function sendFile<T>(
  uploader: Uploader,
  path: string,
  file: Blob,
  plan: Plan,
  { onProgress, signal }: Pick<UploadOptions, "onProgress" | "signal">,
  finish: (parts: { n: number; etag: string }[]) => Promise<T>,
) {
  try {
    const queue = [...plan.parts];
    const parts: { n: number; etag: string }[] = [];
    let loaded = 0;

    const worker = async () => {
      for (let part = queue.shift(); part; part = queue.shift()) {
        const blob = file.slice((part.n - 1) * plan.partSize, part.n * plan.partSize);
        parts.push({ n: part.n, etag: await putPart(uploader, part.url, blob, signal) });
        loaded += blob.size;
        onProgress?.({ loaded, total: file.size });
      }
    };
    await Promise.all([1, 2, 3, 4].map(worker));

    signal?.throwIfAborted();
    return await finish(parts);
  } catch (error) {
    await uploader.request("DELETE", path).catch(() => {});
    throw error;
  }
}

// Sends one part and returns its ETag. Proxied parts (a path) answer `{ etag }`; direct ones (S3) send the header.
// A 4xx other than 408 and 429 is final; anything else is retried 3 times with backoff.
async function putPart(
  { baseUrl, fetchFn, auth }: Uploader,
  url: string,
  blob: Blob,
  signal?: AbortSignal,
) {
  const proxied = url.startsWith("/");

  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    const res = await fetchFn(proxied ? `${baseUrl}${url}` : url, {
      method: "PUT",
      body: blob,
      headers: proxied ? auth : undefined,
      signal,
    }).catch((error) => {
      if (signal?.aborted || attempt >= 3) throw error;
    });

    if (res?.ok) return proxied ? (await res.json()).etag : (res.headers.get("etag") ?? "");

    const final = res && res.status < 500 && res.status !== 408 && res.status !== 429;
    if (res && (final || attempt >= 3))
      throw new CmsError(res.status, await res.json().catch(() => null));

    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
}
