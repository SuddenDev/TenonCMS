/**
 * Splits bytes or a stream into parts of `partSize` bytes; the last part MAY be shorter.
 * A stream part is buffered in memory and copied once.
 */
export async function* chunks(data: Uint8Array | ReadableStream<Uint8Array>, partSize: number) {
  if (data instanceof Uint8Array) {
    for (let i = 0; i < data.length; i += partSize) yield data.subarray(i, i + partSize);
    return;
  }

  let pending: Uint8Array[] = [];
  let length = 0;
  const flush = () => {
    const part = new Uint8Array(length);
    let offset = 0;
    for (const p of pending) {
      part.set(p, offset);
      offset += p.length;
    }
    pending = [];
    length = 0;
    return part;
  };

  for await (let chunk of data as unknown as AsyncIterable<Uint8Array>) {
    // Fill the current part, yield it, and carry the rest of the chunk over.
    while (length + chunk.length >= partSize) {
      const take = partSize - length;
      pending.push(chunk.subarray(0, take));
      length = partSize;
      yield flush();
      chunk = chunk.subarray(take);
    }
    if (!chunk.length) continue;
    pending.push(chunk);
    length += chunk.length;
  }
  if (length) yield flush();
}
