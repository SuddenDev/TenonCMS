import type { Core } from "../../../cms/runtime/types.ts";
import { ValidationError } from "../../../errors.ts";
import { mediaOf } from "../../runtime/create-media-core.ts";
import { type Row, partsOf } from "./upload-data.ts";

/** The byte length part `n` MUST have. Throws for `n` out of range. */
function partLength(row: Row, n: number) {
  const parts = partsOf(row);
  if (!Number.isInteger(n) || n < 1 || n > parts) throw new ValidationError({ n: "Out of range" });
  return n < parts ? row.part_size : row.size - (parts - 1) * row.part_size;
}

/** Step 2 for proxied uploads: streams part `n` into storage. Parts MAY come out of order or twice. */
export async function putPart(core: Core, row: Row, n: number, body: ReadableStream<Uint8Array>) {
  const { storage } = mediaOf(core);
  if (!storage.putPart) throw new ValidationError({ n: "This storage takes parts directly" });
  const expected = partLength(row, n);
  let count = 0;
  const counted = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        count += chunk.length;
        if (count > expected) controller.error(new Error("Part too large"));
        else controller.enqueue(chunk);
      },
    }),
  );
  const wrong = () => new ValidationError({ n: `Part ${n} MUST have ${expected} bytes` });
  const result = await storage
    .putPart(row.key, row.adapter_upload_id, n, counted, row.part_size)
    .catch((error) => {
      throw count > expected ? wrong() : error;
    });
  if (count !== expected) throw wrong();
  return result;
}
