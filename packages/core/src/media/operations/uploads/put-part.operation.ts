import type { Core } from "../../../cms/runtime/types.ts";
import { ValidationError } from "../../../errors.ts";
import { mediaOf } from "../../runtime/create-media-core.ts";
import { partLength } from "./parts.ts";
import type { Row } from "./upload-row.ts";

/** Step 2 for proxied uploads: streams part `n` into storage. Parts MAY come out of order or twice. */
export async function putPart(core: Core, row: Row, n: number, body: ReadableStream<Uint8Array>) {
  const { storage } = mediaOf(core);
  if (!storage.putPart) throw new ValidationError({ n: "This storage takes parts directly" });

  const expected = partLength(row, n);
  const wrong = () => new ValidationError({ n: `Part ${n} MUST have ${expected} bytes` });
  const counter = countBytes(expected);

  // A too large part fails the stream; the storage error then reads as the wrong length.
  const result = await storage
    .putPart(row.key, row.adapter_upload_id, n, body.pipeThrough(counter.stream), row.part_size)
    .catch((error) => {
      throw counter.count() > expected ? wrong() : error;
    });
  if (counter.count() !== expected) throw wrong();
  return result;
}

// Passes chunks through and counts their bytes. Fails the stream once more than `max` bytes pass.
function countBytes(max: number) {
  let count = 0;
  const stream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      count += chunk.length;
      if (count > max) controller.error(new Error("Part too large"));
      else controller.enqueue(chunk);
    },
  });
  return { stream, count: () => count };
}
