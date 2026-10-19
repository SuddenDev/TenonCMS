/**
 * Checks folder containment without matching sibling prefixes.
 * @returns Whether `path` is the folder itself or a descendant. The root includes every path.
 */
export function folderContains(folder: string, path: string) {
  return !folder || path === folder || path.startsWith(`${folder}/`);
}

/**
 * Resolves file and folder selections without duplicates.
 * @returns Matching files in their original order.
 */
export function selectedMedia<T extends { id: string; folder: string }>(
  files: T[],
  ids: string[],
  folders: string[],
) {
  const selected = new Set(ids);
  return files.filter(
    (file) =>
      selected.has(file.id) || folders.some((folder) => folderContains(folder, file.folder)),
  );
}

/**
 * Resolves a move while preserving the outermost selected folder and its descendants.
 * @returns The destination folder of the file.
 */
export function moveDestination(folder: string, roots: string[], destination: string) {
  const root = roots
    .filter((path) => folderContains(path, folder))
    .sort((a, b) => a.length - b.length)[0];
  return root === undefined
    ? destination
    : [destination, root.split("/").at(-1) + folder.slice(root.length)].filter(Boolean).join("/");
}
