import { computed, ref, shallowRef, type MaybeRefOrGetter, type ShallowRef } from "vue";
import { useEventListener } from "@vueuse/core";
import type { FileWithPath, useFileHandler } from "./useFileHandler";

export type { FileWithPath } from "./useFileHandler";

/** Reactive files, drag feedback and directory-read errors of one drop zone. */
export interface UseDropZoneReturn {
  files: ShallowRef<FileWithPath[] | null>;
  isOverDropZone: ShallowRef<boolean>;
  isReading: Readonly<ShallowRef<boolean>>;
  error: ShallowRef<Error | null>;
}

/** Optional drag callbacks and handling for non-file drags. */
export interface UseDropZoneOptions {
  onEnter?: (files: FileWithPath[] | null, event: DragEvent) => void;
  onLeave?: (files: FileWithPath[] | null, event: DragEvent) => void;
  onOver?: (files: FileWithPath[] | null, event: DragEvent) => void;
  preventDefaultForUnhandled?: boolean;
}

/**
 * Reads file and directory drops and keeps drag feedback stable across children.
 * @param target Element or document that receives file drags.
 * @param fileHandler Shared selection and upload handler for drops and dialogs.
 * @returns Reactive files, reading state, errors and drag feedback. Listeners follow the Vue scope.
 */
export function useDropZone(
  target: MaybeRefOrGetter<HTMLElement | Document | null | undefined>,
  fileHandler: ReturnType<typeof useFileHandler>,
  options: UseDropZoneOptions = {},
): UseDropZoneReturn {
  const isOverDropZone = shallowRef(false);
  const files = shallowRef<FileWithPath[] | null>(null);
  const error = shallowRef<Error | null>(null);
  const reading = ref(0);
  let depth = 0;

  function acceptsDrag(event: DragEvent) {
    const data = event.dataTransfer;
    return (
      !!data &&
      (Array.from(data.types ?? []).includes("Files") ||
        Array.from(data.items ?? []).some((item) => item.kind === "file") ||
        !!data.files?.length)
    );
  }

  function handleDrag(event: DragEvent, kind: "enter" | "over" | "leave") {
    if (!acceptsDrag(event) && !(kind === "leave" && depth)) {
      if (options.preventDefaultForUnhandled) event.preventDefault();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    if (kind === "enter") depth++;
    if (kind === "leave") depth = Math.max(0, depth - 1);
    isOverDropZone.value = kind === "over" || depth > 0;
    if (kind === "enter") options.onEnter?.(null, event);
    if (kind === "over") options.onOver?.(null, event);
    if (kind === "leave") options.onLeave?.(null, event);
  }

  async function drop(event: DragEvent) {
    depth = 0;
    isOverDropZone.value = false;
    if (!acceptsDrag(event)) {
      if (options.preventDefaultForUnhandled) event.preventDefault();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    error.value = null;
    files.value = null;
    let selected: FileWithPath[];
    reading.value++;
    try {
      selected = await droppedFiles(event.dataTransfer!, fileHandler.acceptDirectories);
    } catch (cause) {
      error.value = cause instanceof Error ? cause : new Error(String(cause));
      return;
    } finally {
      reading.value--;
    }
    const processed = await fileHandler.processDroppedFiles(selected);
    files.value = processed.length ? processed : null;
  }

  useEventListener(target, "dragenter", (event) => handleDrag(event as DragEvent, "enter"));
  useEventListener(target, "dragover", (event) => handleDrag(event as DragEvent, "over"));
  useEventListener(target, "dragleave", (event) => handleDrag(event as DragEvent, "leave"));
  useEventListener(target, "drop", (event) => {
    void drop(event as DragEvent);
  });

  return { files, isOverDropZone, isReading: computed(() => reading.value > 0), error };
}

async function readEntry(entry: FileSystemEntry, path: string): Promise<FileWithPath[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    return [Object.assign(file, { relativePath: path })];
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const files: FileWithPath[] = [];
  while (true) {
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (!entries.length) return files;
    for (const child of entries) files.push(...(await readEntry(child, `${path}/${child.name}`)));
  }
}

async function droppedFiles(data: DataTransfer, acceptDirectories: boolean) {
  // DataTransfer MUST be read before the first await; browsers protect it after dispatch.
  const sources = Array.from(data.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => ({
      entry: item.webkitGetAsEntry?.(),
      file: item.getAsFile?.(),
    }));
  const fallback = Array.from(data.files ?? []);
  if (!sources.length) return fallback;
  const files: FileWithPath[] = [];
  for (const { entry, file } of sources) {
    if (entry) {
      if (entry.isFile || acceptDirectories) files.push(...(await readEntry(entry, entry.name)));
    } else if (file) files.push(file);
  }
  return files;
}
