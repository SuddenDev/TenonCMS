// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import { useFileHandler } from "./useFileHandler";

const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.restoreAllMocks();
});

function handler(options: Parameters<typeof useFileHandler>[0] = {}) {
  const scope = effectScope();
  scopes.push(scope);
  return scope.run(() => useFileHandler(options))!;
}

describe("useFileHandler", () => {
  it("preserves relative paths and skips system files for a dropped directory", async () => {
    const ready = vi.fn();
    const files = handler({ onFilesReady: ready });
    const photo = Object.assign(new File(["image"], "photo.jpg", { type: "image/jpeg" }), {
      relativePath: "trip/images/photo.jpg",
    });
    await files.processDroppedFiles([photo, new File([], ".DS_Store"), new File([], "cache.tmp")]);
    expect(files.selectedFiles.value).toEqual([photo]);
    expect(ready).toHaveBeenCalledWith([photo]);
    expect(files.selectedFiles.value[0].relativePath).toBe("trip/images/photo.jpg");
  });

  it("matches MIME types exactly and applies callback filters even when they have no arguments", async () => {
    const jpg = new File([], "photo.jpg", { type: "image/jpeg" });
    const png = new File([], "photo.png", { type: "image/png" });
    const image = handler({ acceptTypes: ["image/*"] });
    expect(image.validateFileTypes([jpg, png])).toBe(true);
    const exact = handler({ acceptTypes: ["image"] });
    expect(exact.validateFileTypes([jpg])).toBe(false);
    const reject = handler({ acceptTypes: () => false });
    expect(await reject.processDroppedFiles([jpg])).toEqual([]);
  });

  it("keeps the first allowed file for single selection and enforces disabled directory uploads", async () => {
    const nested = Object.assign(new File([], "nested.txt"), { relativePath: "folder/nested.txt" });
    const plain = new File([], "plain.txt");
    const files = handler({ multiple: false, acceptDirectories: false });
    expect(await files.processDroppedFiles([nested, plain, new File([], "other.txt")])).toEqual([
      plain,
    ]);
  });

  it("keeps upload state until all callbacks settle and exposes callback errors", async () => {
    let finish!: () => void;
    const ready = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)))
      .mockRejectedValueOnce(new Error("Upload failed"));
    const files = handler({ onFilesReady: ready });
    const first = files.processDroppedFiles([new File([], "first.txt")]);
    expect(files.isUploading.value).toBe(true);
    await files.processDroppedFiles([new File([], "second.txt")]);
    expect(files.error.value?.message).toBe("Upload failed");
    expect(files.isUploading.value).toBe(true);
    finish();
    await first;
    expect(files.isUploading.value).toBe(false);
    files.clearFiles();
    expect(files.selectedFiles.value).toEqual([]);
  });

  it("processes directory dialog selections through the same callback", async () => {
    const ready = vi.fn();
    const files = handler({ onFilesReady: ready });
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    files.openDirectoryDialog();
    const input = click.mock.contexts[0] as HTMLInputElement;
    expect(input.webkitdirectory).toBe(true);
    const photo = new File([], "photo.jpg", { type: "image/jpeg" });
    Object.defineProperty(photo, "webkitRelativePath", { value: "trip/photo.jpg" });
    Object.defineProperty(input, "files", { value: [photo] });
    input.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce());
    expect(files.selectedFiles.value[0].relativePath).toBe("trip/photo.jpg");
  });
});
