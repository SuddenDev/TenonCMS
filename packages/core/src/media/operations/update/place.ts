import type { Kysely } from "kysely";
import type { Database } from "../../../db/types.ts";
import { ValidationError } from "../../../errors.ts";
import type { MediaDoc, MediaUpdate } from "../../../schema/index.ts";
import { namesIn } from "../../library/names-in.ts";
import { cleanFolder, cleanName, keyOf } from "../../library/names.ts";

/** Where a file lives: its folder, filename and storage key. */
export type Place = { folder: string; filename: string; key: string };

/** The place of a file after an update. Inputs that are not set keep the current values. */
export function placeOf(original: MediaDoc, input: MediaUpdate): Place {
  const folder = input.folder === undefined ? original.folder : cleanFolder(input.folder);
  const filename = input.filename === undefined ? original.filename : cleanName(input.filename);
  return { folder, filename, key: keyOf(folder, filename) };
}

/**
 * Checks that no other file in the target folder has the filename, case-insensitive. The file itself does not count,
 * so a rename that only changes case passes.
 * @throws {ValidationError} `Already used` for a taken name.
 */
export async function checkFree(db: Kysely<Database>, { folder, filename }: Place, self: MediaDoc) {
  const isSelf = (name: string) => folder === self.folder && name === self.filename;
  const taken = (await namesIn(db, folder)).filter((name) => !isSelf(name));

  if (taken.some((name) => name.toLowerCase() === filename.toLowerCase()))
    throw new ValidationError({ filename: "Already used" });
}
