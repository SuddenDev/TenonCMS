import { useFileDialog } from "@vueuse/core";
import { computed, readonly, ref, shallowRef } from "vue";
import { accepts } from "../../../../../core/src/media/library/names";

/** A browser file with its path inside a selected or dropped directory. */
export interface FileWithPath extends File {
  relativePath?: string;
}

/** File restrictions and the callback shared by dialogs and drops. */
export interface UseFileHandlerOptions {
  acceptTypes?: readonly string[] | ((types: readonly string[]) => boolean);
  multiple?: boolean;
  acceptDirectories?: boolean;
  excludeTypes?: readonly string[];
  onFilesReady?: (files: FileWithPath[]) => void | Promise<void>;
}

/**
 * Shares file selection, filtering and upload state between dialogs and drops.
 * @param options File restrictions and the callback to run after filtering.
 * @returns File and directory dialogs, selection methods and reactive callback state.
 */
export function useFileHandler(options: UseFileHandlerOptions = {}) {
  const {
    acceptTypes,
    multiple = true,
    acceptDirectories = true,
    excludeTypes = [".DS_Store", ".gitkeep", "Thumbs.db", "*.tmp", "*.temp", "*.log"],
    onFilesReady,
  } = options;
  const selectedFiles = shallowRef<FileWithPath[]>([]);
  const pending = ref(0);
  const error = shallowRef<Error | null>(null);

  function isFileExcluded(name: string) {
    return excludeTypes.some((pattern) =>
      pattern.startsWith("*.")
        ? name.toLowerCase().endsWith(pattern.slice(1).toLowerCase())
        : name.toLowerCase() === pattern.toLowerCase(),
    );
  }

  function checkAcceptTypes(types: readonly string[]) {
    if (typeof acceptTypes === "function") return acceptTypes(types);
    return !acceptTypes?.length || types.every((type) => accepts([...acceptTypes], type));
  }

  function validateFileTypes(files: File[]) {
    return files.every((file) => !isFileExcluded(file.name) && checkAcceptTypes([file.type]));
  }

  async function processDroppedFiles(files: Iterable<FileWithPath> | null) {
    error.value = null;
    const filtered = Array.from(files ?? []).filter(
      (file) =>
        validateFileTypes([file]) &&
        (acceptDirectories || !(file.relativePath || file.webkitRelativePath)?.includes("/")),
    );
    const selected = (multiple ? filtered : filtered.slice(0, 1)).map((file) =>
      Object.assign(file, {
        relativePath: file.relativePath || file.webkitRelativePath || file.name,
      }),
    );
    selectedFiles.value = selected;
    if (!selected.length) return selected;
    pending.value++;
    try {
      await onFilesReady?.(selected);
      return selected;
    } catch (cause) {
      error.value = cause instanceof Error ? cause : new Error(String(cause));
      return [];
    } finally {
      pending.value--;
    }
  }

  const fileDialog = useFileDialog({
    multiple,
    reset: true,
    accept: typeof acceptTypes === "function" ? undefined : acceptTypes?.join(","),
  });
  const directoryDialog = useFileDialog({ multiple, directory: true, reset: true });
  fileDialog.onChange((files) => {
    if (files?.length) return processDroppedFiles(files);
  });
  directoryDialog.onChange((files) => {
    if (files?.length && acceptDirectories) return processDroppedFiles(files);
  });

  function clearFiles() {
    selectedFiles.value = [];
    error.value = null;
    fileDialog.reset();
    directoryDialog.reset();
  }

  return {
    openFileDialog: fileDialog.open,
    openDirectoryDialog: () => {
      if (acceptDirectories) directoryDialog.open();
    },
    processDroppedFiles,
    selectedFiles: readonly(selectedFiles),
    isUploading: computed(() => pending.value > 0),
    error: readonly(error),
    acceptDirectories,
    clearFiles,
    validateFileTypes,
    isFileExcluded,
    checkAcceptTypes,
    fileDialog,
    directoryDialog,
  };
}
