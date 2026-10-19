// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createApp, h, nextTick, type App, type Component } from "vue";
import { toast } from "vue-sonner";
import { client, type MediaRead } from "@/shared/api";
import { i18n } from "@/shared/i18n";
import { uploadFiles } from "./uploads";

vi.mock("vue-sonner", () => ({
  toast: { custom: vi.fn(() => 1), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));
vi.mock("@/shared/components/Icon.vue", () => ({ default: { render: () => null } }));

let app: App | undefined;
let root: HTMLDivElement | undefined;
const jobs = new Map<string, { progress(loaded: number): void; finish(): void; fail(): void }>();

beforeEach(() => {
  jobs.clear();
  vi.spyOn(client.media, "upload").mockImplementation(
    (file, options) =>
      new Promise((resolve, reject) => {
        jobs.set(file.name!, {
          progress: (loaded) => options?.onProgress?.({ loaded, total: file.size }),
          finish: () =>
            resolve({
              id: file.name,
              filename: file.name,
              folder: options?.folder ?? "",
              size: file.size,
            } as MediaRead),
          fail: () => reject(new Error("Connection lost")),
        });
        options?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Canceled", "AbortError")),
          { once: true },
        );
      }),
  );
});

afterEach(() => {
  app?.unmount();
  root?.remove();
  app = undefined;
  root = undefined;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function mountProgress() {
  const [component, options] = vi.mocked(toast.custom).mock.calls.at(-1)!;
  root = document.createElement("div");
  document.body.append(root);
  app = createApp({ render: () => h(component as Component, options!.componentProps) }).use(i18n);
  app.mount(root);
  await nextTick();
  return root;
}

it("combines overlapping batches, keeps completed bytes, and announces success only after all requests finish", async () => {
  const first = uploadFiles([
    new File(["a".repeat(10)], "first.txt"),
    new File(["b".repeat(30)], "second.txt"),
  ]);
  const popup = await mountProgress();
  expect(vi.mocked(toast.custom).mock.calls[0]![1]).toMatchObject({
    position: "bottom-right",
    duration: Infinity,
    dismissible: false,
  });
  jobs.get("first.txt")!.progress(10);
  jobs.get("second.txt")!.progress(10);
  jobs.get("first.txt")!.finish();
  await nextTick();
  await nextTick();
  expect(popup.querySelector("[role=progressbar]")?.getAttribute("aria-valuenow")).toBe("50");
  expect(toast.success).not.toHaveBeenCalled();
  const second = uploadFiles([new File(["c".repeat(20)], "third.txt")]);
  await nextTick();
  expect(toast.custom).toHaveBeenCalledTimes(1);
  expect(popup.querySelector("[role=progressbar]")?.getAttribute("aria-valuenow")).toBe("33");
  jobs.get("second.txt")!.finish();
  await first;
  expect(toast.success).not.toHaveBeenCalled();
  expect(popup.querySelector("[data-slot=spinner]")).not.toBeNull();
  jobs.get("third.txt")!.progress(20);
  await nextTick();
  expect(popup.querySelector("[role=progressbar]")?.getAttribute("aria-valuenow")).toBe("99");
  jobs.get("third.txt")!.finish();
  await second;
  expect(toast.success).toHaveBeenCalledExactlyOnceWith("3 files uploaded");
  expect(toast.dismiss).toHaveBeenCalledWith(1);
});

it("shows failures immediately and never shows a success toast for a partial failure", async () => {
  const pending = uploadFiles([new File(["a"], "first.txt"), new File(["b"], "second.txt")]);
  const popup = await mountProgress();
  jobs.get("first.txt")!.fail();
  await nextTick();
  await nextTick();
  expect(toast.error).toHaveBeenCalledWith("Could not upload first.txt", {
    description: "Connection lost",
  });
  expect(popup.querySelector("[role=alert]")?.textContent).toContain("Connection lost");
  jobs.get("second.txt")!.finish();
  expect((await pending).map((doc) => doc.id)).toEqual(["second.txt"]);
  await nextTick();
  expect(toast.success).not.toHaveBeenCalled();
  expect(popup.querySelector("[data-slot=spinner]")).toBeNull();
  expect(toast.dismiss).not.toHaveBeenCalled();
});

it("cancels individual uploads without a failure or success notification", async () => {
  const pending = uploadFiles([new File(["a"], "cancel.txt")]);
  const popup = await mountProgress();
  [...popup.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.textContent?.trim() === "Cancel")!
    .click();
  expect(await pending).toEqual([]);
  await nextTick();
  expect(popup.textContent).toContain("Canceled");
  expect(toast.error).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
  expect(popup.querySelector("[data-slot=spinner]")).toBeNull();
});

it("validates field rules and preserves nested upload paths", async () => {
  const photo = Object.assign(new File(["image"], "photo.png", { type: "image/png" }), {
    relativePath: "trip/photo.png",
  });
  const pending = uploadFiles([photo, new File(["text"], "notes.txt", { type: "text/plain" })], {
    folder: "assets",
    rules: { type: "image" },
  });
  expect(client.media.upload).toHaveBeenCalledExactlyOnceWith(
    photo,
    expect.objectContaining({
      folder: "assets/trip",
      signal: expect.any(AbortSignal),
      onProgress: expect.any(Function),
    }),
  );
  expect(toast.error).toHaveBeenCalledWith("Could not upload notes.txt", {
    description: "Not allowed for this field",
  });
  jobs.get("photo.png")!.finish();
  expect((await pending).map((doc) => doc.id)).toEqual(["photo.png"]);
  expect(toast.success).not.toHaveBeenCalled();
});

it("handles empty files and preserves result order when uploads finish out of order", async () => {
  expect(await uploadFiles([])).toEqual([]);
  expect(toast.custom).not.toHaveBeenCalled();
  const pending = uploadFiles([new File([], "first.txt"), new File([], "second.txt")]);
  const popup = await mountProgress();
  jobs.get("second.txt")!.finish();
  await nextTick();
  await nextTick();
  expect(popup.querySelector("[role=progressbar]")?.getAttribute("aria-valuenow")).toBe("50");
  jobs.get("first.txt")!.finish();
  expect((await pending).map((doc) => doc.id)).toEqual(["first.txt", "second.txt"]);
  expect(toast.success).toHaveBeenCalledExactlyOnceWith("2 files uploaded");
});
