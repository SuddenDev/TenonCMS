import { col } from "../../content/targets.ts";
import { guardAll } from "../../access/rule.ts";
import { makeZip } from "client-zip";
import type { Core, Scope } from "../../cms/runtime/types.ts";
import { q } from "../../cms/runtime/transaction.ts";
import { findDocs } from "../../db/queries/documents/find-documents.query.ts";
import { ValidationError } from "../../errors.ts";
import { notFound } from "../../http/errors.ts";
import { folderContains, selectedMedia } from "../library/selection.ts";
import { mediaOf } from "../runtime/create-media-core.ts";
import type { MediaDoc } from "../../schema/index.ts";
import type { Storage } from "../storage/types.ts";

/**
 * Streams selected originals without buffering files. Only one storage source opens at a time.
 * @returns The ZIP body and attachment filename. Cancelling the body cancels the active source.
 * @throws For an unknown file ID or an unsafe archive path.
 * @throws {ForbiddenError} Unless `media.access.read` allows without a `where`.
 */
export async function downloadArchive(core: Core, scope: Scope, ids: string[], folders: string[]) {
  await guardAll(core, scope, col("media"), "read");
  const all = (await findDocs(await q(core, scope), "media", {})) as MediaDoc[];
  const files = selectedMedia(all, ids, folders);
  if (ids.some((id) => !files.some((file) => file.id === id))) throw notFound();
  const roots = [...new Set(folders)].filter(
    (root) => !folders.some((parent) => parent !== root && folderContains(parent, root)),
  );
  const entries = archiveEntries(files, ids, roots);
  const inputs = archiveSources(mediaOf(core).storage, entries);

  // client-zip calls throw() on cancellation, so finish the source without rethrowing.
  inputs.throw = () => inputs.return(undefined);
  return {
    body: makeZip(inputs),
    filename:
      roots.length === 1 && ids.length === 0 ? `${roots[0]!.split("/").at(-1)}.zip` : "media.zip",
  };
}

function archiveEntries(files: MediaDoc[], ids: string[], roots: string[]) {
  const prefix = archivePrefix([
    ...roots,
    ...files.filter((file) => ids.includes(file.id)).map((file) => file.key),
  ]);
  const entries = [
    ...roots.map((path) => ({ name: `${path.slice(prefix.length)}/`, file: undefined })),
    ...files.map((file) => ({ name: file.key.slice(prefix.length), file })),
  ];
  if (entries.some(({ name }) => /^(?:\/|[a-z]:)/i.test(name) || name.split("/").includes("..")))
    throw new ValidationError({ download: "Invalid archive path" });
  return entries;
}

async function* archiveSources(storage: Storage, entries: ReturnType<typeof archiveEntries>) {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    for (const { name, file } of entries) {
      if (!file) {
        yield { name };
        continue;
      }
      const source = await storage.get(file.key);
      if (!source) throw notFound();
      reader = source.body.getReader();
      yield { name, lastModified: file.updatedAt, input: chunks(reader) };
      reader.releaseLock();
      reader = undefined;
    }
  } finally {
    if (reader) {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}

function archivePrefix(paths: string[]) {
  const parent = paths[0]!.split("/").slice(0, -1);
  while (parent.length && !paths.every((path) => path.startsWith(`${parent.join("/")}/`)))
    parent.pop();
  return parent.length ? `${parent.join("/")}/` : "";
}

async function* chunks(reader: ReadableStreamDefaultReader<Uint8Array>) {
  while (true) {
    const next = await reader.read();
    if (next.done) return;
    yield next.value;
  }
}
