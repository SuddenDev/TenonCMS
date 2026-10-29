import { AwsClient } from "aws4fetch";
import { beforeAll, describe, expect, it } from "vitest";
import { s3 } from "./index.ts";

// Runs only against a real bucket, e.g. MinIO: `docker run -p 9000:9000 minio/minio server /data`, then
// S3_TEST_ENDPOINT=http://localhost:9000 S3_TEST_KEY=minioadmin S3_TEST_SECRET=minioadmin npx vitest run s3.live
const endpoint = process.env.S3_TEST_ENDPOINT;
const options = {
  bucket: process.env.S3_TEST_BUCKET ?? "tenon-test",
  region: process.env.S3_TEST_REGION ?? "us-east-1",
  endpoint,
  accessKeyId: process.env.S3_TEST_KEY ?? "",
  secretAccessKey: process.env.S3_TEST_SECRET ?? "",
  publicUrl: `${endpoint}/tenon-test`,
};

describe.skipIf(!endpoint)("s3 against a real bucket", { timeout: 60_000 }, () => {
  const storage = s3(options);
  const MB = 1024 ** 2;
  const data = Uint8Array.from({ length: 6 * MB }, (_, i) => i % 251);

  beforeAll(async () => {
    const client = new AwsClient({ ...options, service: "s3" });
    await client.fetch(`${endpoint}/${options.bucket}`, { method: "PUT" });
  });

  it("uploads in parts, reads, moves and deletes", async () => {
    const key = `live/${crypto.randomUUID()}.bin`;
    const { uploadId } = await storage.createUpload(key, {
      size: data.length,
      mimeType: "application/octet-stream",
      parts: 2,
    });
    const parts = [];
    for (const n of [1, 2]) {
      const url = await storage.partUrl!(key, uploadId, n, 3600);
      const body = data.subarray((n - 1) * 5 * MB, n * 5 * MB);
      const res = await fetch(url, { method: "PUT", body });
      expect(res.status).toBe(200);
      parts.push({ n, etag: res.headers.get("etag")! });
    }
    expect(await storage.complete(key, uploadId, parts)).toEqual({ size: data.length });
    const range = await storage.get(key, { start: 0, end: 9 });
    expect(range?.size).toBe(data.length);
    expect(new Uint8Array(await new Response(range!.body).arrayBuffer())).toEqual(
      data.subarray(0, 10),
    );
    const moved = `${key}.moved`;
    await storage.move(key, moved);
    expect(await storage.get(key)).toBeUndefined();
    const whole = await storage.get(moved);
    expect(new Uint8Array(await new Response(whole!.body).arrayBuffer())).toEqual(data);
    await storage.delete(moved);
    expect(await storage.get(moved)).toBeUndefined();
  });

  it("aborts an upload", async () => {
    const key = `live/${crypto.randomUUID()}.bin`;
    const { uploadId } = await storage.createUpload(key, {
      size: 1,
      mimeType: "text/plain",
      parts: 1,
    });
    await storage.abort(key, uploadId);
    await expect(storage.complete(key, uploadId, [{ n: 1, etag: "x" }])).rejects.toThrow();
  });
});
