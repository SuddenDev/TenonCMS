/** One file of a ZIP archive. Reading it slices the archive, so nothing else is held in memory. */
export type ZipEntry = {
  name: string;
  /** The uncompressed size in bytes. */
  size: number;
  stream(): ReadableStream<Uint8Array>;
  bytes(): Promise<Uint8Array>;
};

/** Random access to the bytes of an archive, e.g. a file in storage. `read()` streams bytes `start` to `end - 1`. */
export type ZipSource = {
  size: number;
  read(start: number, end: number): Promise<ReadableStream<Uint8Array>>;
};

const END = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX = 0xffffffff;

// ponytail: no ZIP64, so an archive and each file MUST stay under 4 GB. Read the ZIP64 records when one gets bigger.
/**
 * Reads the directory of a ZIP archive. Entries use STORE or DEFLATE. A `Blob` from `fs.openAsBlob()` or a
 * {@link ZipSource} is read piece by piece.
 * @returns The entries by name, in archive order. Folder entries are left out.
 * @throws For data that is not a ZIP, a ZIP64 archive or an unsupported compression method.
 */
export async function readZip(input: Blob | ZipSource): Promise<Map<string, ZipEntry>> {
  const archive: ZipSource =
    input instanceof Blob
      ? { size: input.size, read: async (start, end) => input.slice(start, end).stream() }
      : input;
  const view = async (start: number, end: number) =>
    new DataView(await new Response(await archive.read(start, end)).arrayBuffer());

  // The end record sits in the last 22 bytes, plus a comment of up to 64 KB.
  const tailStart = Math.max(0, archive.size - 22 - 0xffff);
  const tail = await view(tailStart, archive.size);
  let at = tail.byteLength - 22;
  while (at >= 0 && tail.getUint32(at, true) !== END) at--;
  if (at < 0) throw new Error("tenoncms: the archive is not a ZIP file");
  const count = tail.getUint16(at + 10, true);
  const size = tail.getUint32(at + 12, true);
  const offset = tail.getUint32(at + 16, true);
  if (offset === MAX || size === MAX) throw new Error("tenoncms: ZIP64 archives are not supported");

  const directory = await view(offset, offset + size);
  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (directory.getUint32(p, true) !== CENTRAL) throw new Error("tenoncms: broken ZIP directory");
    const method = directory.getUint16(p + 10, true);
    const compressed = directory.getUint32(p + 20, true);
    const uncompressed = directory.getUint32(p + 24, true);
    const nameLength = directory.getUint16(p + 28, true);
    const extraLength = directory.getUint16(p + 30, true);
    const commentLength = directory.getUint16(p + 32, true);
    const local = directory.getUint32(p + 42, true);
    const name = decoder.decode(
      new Uint8Array(directory.buffer, directory.byteOffset + p + 46, nameLength),
    );
    p += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith("/")) continue;
    if (compressed === MAX || uncompressed === MAX || local === MAX)
      throw new Error("tenoncms: ZIP64 archives are not supported");
    if (method !== 0 && method !== 8)
      throw new Error(`tenoncms: unsupported ZIP compression method ${method} in "${name}"`);

    const data = async () => {
      const header = await view(local, local + 30);
      if (header.getUint32(0, true) !== LOCAL) throw new Error("tenoncms: broken ZIP entry");
      const start = local + 30 + header.getUint16(26, true) + header.getUint16(28, true);
      return archive.read(start, start + compressed);
    };
    const stream = () => {
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      void data()
        .then((raw) =>
          (method === 8
            ? raw.pipeThrough(new DecompressionStream("deflate-raw") as never)
            : raw
          ).pipeTo(writable),
        )
        .catch((error: unknown) => writable.abort(error).catch(() => {}));
      return readable;
    };
    entries.set(name, {
      name,
      size: uncompressed,
      stream,
      bytes: async () => new Uint8Array(await new Response(stream()).arrayBuffer()),
    });
  }
  return entries;
}
