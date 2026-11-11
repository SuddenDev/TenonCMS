# Media

The admin media library, file details and `image` / `file` field picker. Requests use the [shared client](../../shared/api.ts). Storage, validation and deletion rules belong to [core media](../../../../core/src/media/README.md); this module owns browser state and presentation.

## Follow an upload

`composables/useFileHandler.ts` → `uploads.ts` → `components/MediaUploadProgress.vue`

`useFileHandler()` filters dialog selections and files from `useDropZone()`. The drop zone reads directory batches and preserves relative paths. `uploadFiles()` checks field restrictions, uploads through `client.media.upload()` and keeps one progress toast across overlapping batches and navigation. Successful results retain input order. Failed and cancelled uploads remain visible; only a fully successful queue produces a success toast. `MediaField.vue` also uses this queue for its upload input.

## Follow a library action

`views/Media.vue` → `components/MediaLibrary.vue` → `components/MediaActions.vue`

The view binds the folder to the route and opens `MediaFile.vue` in a sheet through `?file=<id>`. The library loads files and folders, handles picks and renames, and keeps empty folders locally until an upload gives them a stored file. `MediaActions.vue` resolves selected folders recursively, then moves or deletes each file. Partial failures leave unsuccessful items selected. Deletion uses the shared linked-document confirmation. Downloads use native links to the protected core endpoint.

## Selection and views

`MediaLibrary.vue` shows a grid or a list. The choice is kept in `localStorage` (`tenon-media-view`) and shared by the page and the picker. Grid tiles shrink with a container query, so a narrow pane or the picker dialog fits more columns. Cmd/Ctrl+click toggles an item, Shift+click (on the item or its checkbox) adds the range from the last clicked item through `selectRange()`. A single-file picker ignores both. `defineShortcuts()` adds Cmd/Ctrl+A (select all), Escape (clear) and Cmd/Ctrl+Backspace or Delete (delete selected). They work only while focus is in the library or on the page body, so a dialog or the detail sheet above it keeps its own keys.

## Files

| Path                                                  | Responsibility                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `index.ts`                                            | Module exports.                                                                             |
| `media.ts`                                            | Folder children, field restrictions, file labels, icons, download URLs and range selection. |
| `uploads.ts`                                          | Shared upload queue, cancellation and notifications.                                        |
| `composables/useFileHandler.ts`                       | File dialogs, filtering and callback state.                                                 |
| `composables/useDropZone.ts`                          | File and directory drops, drag feedback and read errors.                                    |
| `views/Media.vue`                                     | Folder routing, detail sheet and image regeneration.                                        |
| `views/MediaFile.vue`                                 | File metadata, preview, save and deletion.                                                  |
| `components/MediaLibrary.vue`                         | Library loading, navigation, views, selection, shortcuts, uploads and renames.              |
| `components/MediaField.vue`                           | Field value, drag and arrow-key reordering, upload input and picker dialog.                 |
| `components/MediaActions.vue`                         | Batch moves and deletes, progress and partial failures.                                     |
| `components/MediaBottomBar.vue`                       | Selection count and batch action controls.                                                  |
| `components/MediaFileItem.vue`, `MediaFolderItem.vue` | File cards or rows and folder rows, with selection controls.                                |
| `components/MediaItemMenu.vue`                        | Per-item download, rename, move and delete controls.                                        |
| `components/MediaThumb.vue`                           | Image thumbnail or file icon.                                                               |
| `components/MediaUploadProgress.vue`                  | Aggregate progress, per-file cancellation and failures.                                     |
| `components/dialogs/`                                 | Rename, new-folder, move and deletion forms.                                                |

The library loads all media documents, so large libraries need pagination. Empty folders are local to the mounted library and disappear on reload. Pickers MAY retain file selections across folder navigation; the standalone library clears selections when its folder changes. File restrictions are checked again by core when the owning document is saved.
