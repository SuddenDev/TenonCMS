import { ValidationError } from "../errors.ts";

// Filename, folder and type rules. Keys mirror folders, so they MUST be safe as file paths and S3 keys.

const MAX = 200;
const RESERVED = [".", "..", ".variants", ".tmp"];

// Drops control characters and path separators, then leading dots.
const clean = (segment: string) =>
  [...segment.normalize("NFC")]
    .filter((c) => c.charCodeAt(0) > 0x1f && c !== "\x7f" && c !== "/" && c !== "\\")
    .join("")
    .replace(/^\.+/, "");

/** Splits `hero.jpg` into `hero` and `.jpg`. A name without a dot has no extension. */
function split(name: string): [string, string] {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

/** A safe filename: NFC, no separators, control characters or leading dots, at most 200 characters. Throws when nothing is left. */
export function cleanName(name: string): string {
  let out = clean(name);
  if (out.length > MAX) {
    const [base, ext] = split(out);
    out = [...base].slice(0, MAX - ext.length).join("") + ext;
  }
  if (!out) throw new ValidationError({ filename: "Invalid name" });
  return out;
}

/** A safe folder path, `''` for the root. Throws for an empty, `.`, `..` or reserved segment. */
export function cleanFolder(folder: string): string {
  const trimmed = folder.normalize("NFC").replace(/^\/+|\/+$/g, "");
  if (!trimmed) return "";
  return trimmed
    .split("/")
    .map((segment) => {
      const out = [...clean(segment)].slice(0, MAX).join("");
      if (RESERVED.includes(segment.toLowerCase()) || !out)
        throw new ValidationError({ folder: "Invalid folder" });
      return out;
    })
    .join("/");
}

/** The storage key of a file: `folder/filename`, or `filename` at the root. */
export const keyOf = (folder: string, filename: string) =>
  folder ? `${folder}/${filename}` : filename;

/** `name`, or `name-1`, `name-2`, … before the extension, whichever is not in `taken`. Case-insensitive. */
export function freeName(taken: Iterable<string>, name: string): string {
  const used = new Set([...taken].map((t) => t.toLowerCase()));
  const [base, ext] = split(name);
  let candidate = name;
  for (let n = 1; used.has(candidate.toLowerCase()); n++) candidate = `${base}-${n}${ext}`;
  return candidate;
}

/** Whether `mimeType` matches one of `accept`; `type/*` matches the whole type. No list accepts everything. */
export const accepts = (accept: string[] | undefined, mimeType: string) =>
  !accept ||
  accept.some((a) => (a.endsWith("/*") ? mimeType.startsWith(a.slice(0, -1)) : a === mimeType));
