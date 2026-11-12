import { makeZip } from "client-zip";
import { describe, expect, it } from "vitest";
import { readZip } from "./read-zip.ts";

const zip = async (files: Parameters<typeof makeZip>[0]) => new Response(makeZip(files)).blob();

const text = async (entry: { stream(): ReadableStream<Uint8Array> } | undefined) =>
  new Response(entry!.stream()).text();

describe("readZip", () => {
  it("reads the entries of a client-zip archive", async () => {
    const archive = await zip([
      { name: "manifest.json", input: '{"a":1}' },
      { name: "media/hero.png", input: new Uint8Array([1, 2, 3]) },
      {
        name: "stream.txt",
        input: new Blob(["streamed"]).stream(),
      },
    ]);

    const entries = await readZip(archive);

    expect([...entries.keys()]).toEqual(["manifest.json", "media/hero.png", "stream.txt"]);
    expect(await text(entries.get("manifest.json"))).toBe('{"a":1}');
    expect(await entries.get("media/hero.png")!.bytes()).toEqual(new Uint8Array([1, 2, 3]));
    expect(await text(entries.get("stream.txt"))).toBe("streamed");
  });

  it("inflates a DEFLATE entry", async () => {
    const body = "hello ".repeat(100);
    const deflated = new Uint8Array(
      await new Response(
        new Blob([body]).stream().pipeThrough(new CompressionStream("deflate-raw")),
      ).arrayBuffer(),
    );
    const archive = deflateArchive("a.txt", deflated, body.length);

    expect(await text((await readZip(archive)).get("a.txt"))).toBe(body);
  });

  it("rejects data that is not a ZIP", async () => {
    await expect(readZip(new Blob(["nope"]))).rejects.toThrow(/ZIP/);
  });
});

// A one-entry archive with method 8. client-zip only writes STORE.
function deflateArchive(name: string, data: Uint8Array<ArrayBuffer>, size: number) {
  const file = new TextEncoder().encode(name);
  const local = new DataView(new ArrayBuffer(30));
  local.setUint32(0, 0x04034b50, true);
  local.setUint16(8, 8, true);
  local.setUint32(18, data.length, true);
  local.setUint32(22, size, true);
  local.setUint16(26, file.length, true);
  const central = new DataView(new ArrayBuffer(46));
  central.setUint32(0, 0x02014b50, true);
  central.setUint16(10, 8, true);
  central.setUint32(20, data.length, true);
  central.setUint32(24, size, true);
  central.setUint16(28, file.length, true);
  central.setUint32(42, 0, true);
  const cdOffset = 30 + file.length + data.length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, 1, true);
  end.setUint16(10, 1, true);
  end.setUint32(12, 46 + file.length, true);
  end.setUint32(16, cdOffset, true);
  return new Blob([local, file, data, central, file, end]);
}
