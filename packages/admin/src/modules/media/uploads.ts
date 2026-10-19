import { markRaw, reactive } from "vue";
import { toast } from "vue-sonner";
import { client, type MediaRead } from "@/shared/api";
import { i18n } from "@/shared/i18n";
import { fits, type MediaRules } from "./media";
import type { FileWithPath } from "./composables/useFileHandler";
import MediaUploadProgress from "./components/MediaUploadProgress.vue";

/** Progress and cancellation state for one file in the shared upload queue. */
export type Upload = {
  name: string;
  loaded: number;
  total: number;
  status: "uploading" | "completed" | "failed" | "canceled";
  error?: string;
  controller: AbortController;
};

let items: Upload[] = reactive([]);
let pending = 0;
let popup: string | number | undefined;

/**
 * Uploads through the shared queue across fields, pickers and navigation.
 * @param files Files from a dialog or drop, with optional relative directory paths.
 * @param options Destination folder and field restrictions, when uploading from a picker.
 * @returns Successful documents in input order. Failures and cancellations remain in the progress toast.
 */
export async function uploadFiles(
  files: Iterable<FileWithPath> | null | undefined,
  options: { folder?: string; rules?: MediaRules } = {},
): Promise<MediaRead[]> {
  const list = Array.from(files ?? []);
  if (!list.length) return [];
  const entries = queueUploads(list);
  const results = await Promise.all(
    list.map((file, index) =>
      uploadFile(file, entries[index]!, options.folder ?? "", options.rules),
    ),
  );
  return results.filter((doc) => doc !== null);
}

function queueUploads(list: FileWithPath[]) {
  const starting = pending === 0;
  if (starting) {
    if (popup !== undefined) toast.dismiss(popup);
    items = reactive([]);
  }
  const entries = list.map((file) =>
    reactive<Upload>({
      name: file.relativePath || file.webkitRelativePath || file.name,
      loaded: 0,
      total: file.size,
      status: "uploading",
      controller: new AbortController(),
    }),
  );
  items.push(...entries);
  pending += entries.length;
  if (starting) {
    const id = toast.custom(markRaw(MediaUploadProgress), {
      position: "bottom-right",
      duration: Infinity,
      dismissible: false,
      componentProps: {
        items,
        onCancel: (upload: Upload) => upload.controller.abort(),
        onDismiss: () => toast.dismiss(id),
      },
    });
    popup = id;
  }

  return entries;
}

async function uploadFile(file: FileWithPath, upload: Upload, folder: string, rules?: MediaRules) {
  try {
    if (rules && !fits(rules, { mimeType: file.type, size: file.size }))
      throw new Error(i18n.global.t("media.notAllowed"));
    const parent = upload.name.includes("/")
      ? upload.name.slice(0, upload.name.lastIndexOf("/"))
      : "";
    const doc = await client.media.upload(file, {
      folder: [folder, parent].filter(Boolean).join("/"),
      signal: upload.controller.signal,
      onProgress: ({ loaded }) => {
        upload.loaded = loaded;
      },
    });
    upload.loaded = upload.total;
    upload.status = "completed";
    return doc as MediaRead;
  } catch (cause) {
    upload.status = upload.controller.signal.aborted ? "canceled" : "failed";
    upload.error =
      upload.status === "canceled"
        ? i18n.global.t("media.canceled")
        : cause instanceof Error
          ? cause.message
          : String(cause);
    if (upload.status === "failed")
      toast.error(i18n.global.t("media.uploadFailed", { name: upload.name }), {
        description: upload.error,
      });
    return null;
  } finally {
    pending--;
    if (!pending && items.every((item) => item.status === "completed")) {
      toast.dismiss(popup);
      popup = undefined;
      toast.success(i18n.global.t("media.uploadedCount", { count: items.length }));
    }
  }
}
