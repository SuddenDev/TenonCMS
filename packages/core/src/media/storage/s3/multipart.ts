import { ValidationError } from "../../../errors.ts";
import type { Storage } from "../types.ts";
import type { S3Client } from "./client.ts";
import { escapeXml, tag } from "./encoding.ts";

const MB = 1024 ** 2;

type Part = { n: number; etag: string };
type Multipart = Pick<Storage, "createUpload" | "partUrl" | "complete" | "abort"> & {
  copyInParts(from: string, to: string, total: number): Promise<void>;
};

/**
 * Multipart uploads, where the browser PUTs each part to a presigned URL, and multipart copies of objects above the
 * `CopyObject` limit.
 */
export function s3Multipart(client: S3Client): Multipart {
  async function createUpload(key: string, { mimeType }: { mimeType: string }) {
    const { text } = await client.send("POST", key, {
      query: { uploads: "" },
      headers: { "content-type": mimeType },
    });
    const uploadId = tag(text, "UploadId");
    if (!uploadId) throw new Error(`S3 did not return an UploadId for ${key}`);
    return { uploadId };
  }

  async function complete(key: string, uploadId: string, parts: Part[]) {
    if (parts.some((p) => !p.etag))
      throw new ValidationError({
        "": "A part has no ETag. The bucket's CORS setting MUST expose the ETag header.",
      });
    const xml = [...parts]
      .sort((a, b) => a.n - b.n)
      .map((p) => `<Part><PartNumber>${p.n}</PartNumber><ETag>${escapeXml(p.etag)}</ETag></Part>`)
      .join("");
    await client.send("POST", key, {
      query: { uploadId },
      body: `<CompleteMultipartUpload>${xml}</CompleteMultipartUpload>`,
    });
    return { size: (await client.size(key)) ?? 0 };
  }

  async function abort(key: string, uploadId: string) {
    await client.send("DELETE", key, { query: { uploadId } }, [404]);
  }

  // `UploadPartCopy` in parts of at least 512 MB. A failed copy aborts the upload.
  async function copyInParts(from: string, to: string, total: number) {
    const { uploadId } = await createUpload(to, { mimeType: "application/octet-stream" });
    const step = Math.max(512 * MB, Math.ceil(total / 10_000));
    const parts: Part[] = [];
    try {
      for (let start = 0, n = 1; start < total; start += step, n++) {
        const end = Math.min(start + step, total) - 1;
        const { text } = await client.send("PUT", to, {
          query: { partNumber: n, uploadId },
          headers: {
            "x-amz-copy-source": client.copySource(from),
            "x-amz-copy-source-range": `bytes=${start}-${end}`,
          },
        });
        parts.push({ n, etag: tag(text, "ETag")!.replace(/&quot;/g, '"') });
      }
      await complete(to, uploadId, parts);
    } catch (error) {
      await abort(to, uploadId).catch(() => {});
      throw error;
    }
  }

  return {
    createUpload,
    partUrl: (key, uploadId, n, expiresIn) =>
      client.presign("PUT", key, { partNumber: n, uploadId, "X-Amz-Expires": expiresIn }),
    complete,
    abort,
    copyInParts,
  };
}
