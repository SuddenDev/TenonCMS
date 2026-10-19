// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { effectScope, nextTick } from "vue";
import { useDropZone } from "./useDropZone";
import { useFileHandler } from "./useFileHandler";

const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()));

async function setup() {
  const target = document.createElement("div");
  const scope = effectScope();
  scopes.push(scope);
  const ready = vi.fn();
  const zone = scope.run(() => useDropZone(target, useFileHandler({ onFilesReady: ready })))!;
  await nextTick();
  return { target, scope, ready, zone };
}

function drag(target: HTMLElement, type: string, data: Partial<DataTransfer>) {
  const event = new Event(type, { cancelable: true, bubbles: true });
  Object.defineProperty(event, "dataTransfer", { value: data });
  target.dispatchEvent(event);
  return event;
}

function fileEntry(name: string): FileSystemFileEntry {
  return {
    name,
    isFile: true,
    isDirectory: false,
    file: (resolve: (file: File) => void) => resolve(new File([], name)),
  } as FileSystemFileEntry;
}

function directory(name: string, batches: FileSystemEntry[][]): FileSystemDirectoryEntry {
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader: () => ({
      readEntries: (resolve: (entries: FileSystemEntry[]) => void) =>
        resolve(batches.shift() ?? []),
    }),
  } as FileSystemDirectoryEntry;
}

it("reads every directory batch and snapshots all top-level entries before awaiting", async () => {
  const { target, ready } = await setup();
  let readable = true;
  const folder = directory("trip", [
    [fileEntry("first.txt")],
    [directory("nested", [[fileEntry("last.txt")]])],
  ]);
  const items = [folder, fileEntry("root.txt")].map((entry) => ({
    kind: "file",
    type: "",
    webkitGetAsEntry: () => (readable ? entry : null),
  }));
  drag(target, "drop", { types: ["Files"], items: items as unknown as DataTransferItemList });
  readable = false;
  await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce());
  expect(ready.mock.calls[0][0].map((file: { relativePath: string }) => file.relativePath)).toEqual(
    ["trip/first.txt", "trip/nested/last.txt", "root.txt"],
  );
});

it("falls back to getAsFile when directory entry APIs are unavailable", async () => {
  const { target, ready } = await setup();
  const file = new File([], "photo.jpg");
  drag(target, "drop", {
    types: ["Files"],
    items: [{ kind: "file", getAsFile: () => file }] as unknown as DataTransferItemList,
  });
  await vi.waitFor(() => expect(ready).toHaveBeenCalledWith([file]));
});

it("falls back to FileList and leaves text drags alone", async () => {
  const { target, ready } = await setup();
  expect(drag(target, "dragover", { types: ["text/plain"] }).defaultPrevented).toBe(false);
  const file = new File([], "photo.jpg");
  expect(
    drag(target, "drop", { types: ["Files"], files: [file] as unknown as FileList })
      .defaultPrevented,
  ).toBe(true);
  await vi.waitFor(() => expect(ready).toHaveBeenCalledWith([file]));
});

it("keeps nested drag feedback stable and removes listeners on disposal", async () => {
  const { target, zone, scope } = await setup();
  const data = { types: ["Files"], dropEffect: "none" } as Partial<DataTransfer>;
  drag(target, "dragenter", data);
  drag(target, "dragenter", data);
  drag(target, "dragleave", data);
  expect(zone.isOverDropZone.value).toBe(true);
  drag(target, "dragleave", data);
  expect(zone.isOverDropZone.value).toBe(false);
  scope.stop();
  expect(drag(target, "dragover", data).defaultPrevented).toBe(false);
});

it("surfaces unreadable directories without starting an incomplete upload", async () => {
  const { target, ready, zone } = await setup();
  const entry = {
    name: "private",
    isDirectory: true,
    createReader: () => ({
      readEntries: (_resolve: unknown, reject: (error: Error) => void) =>
        reject(new Error("Permission denied")),
    }),
  };
  drag(target, "drop", {
    types: ["Files"],
    items: [{ kind: "file", webkitGetAsEntry: () => entry }] as unknown as DataTransferItemList,
  });
  await vi.waitFor(() => expect(zone.error.value?.message).toBe("Permission denied"));
  expect(ready).not.toHaveBeenCalled();
  expect(zone.isReading.value).toBe(false);
});
