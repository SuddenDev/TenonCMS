import { isCancel, spinner } from "@clack/prompts";
import type { ArchiveCounts } from "tenoncms/client";

/** `1.2 MB`, in powers of 1000. */
export function formatBytes(bytes: number) {
  const units = ["B", "kB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${unit ? value.toFixed(1) : value} ${units[unit]}`;
}

/** One line per table with rows, then the media files. Empty tables are left out. */
export function formatCounts({ tables, media }: ArchiveCounts) {
  const rows = Object.entries(tables).filter(([, n]) => n > 0);
  const width = Math.max(0, ...rows.map(([name]) => name.length));
  const lines = rows.map(([name, n]) => `${name.padEnd(width)}  ${n}`);
  if (media.files)
    lines.push(`${"media".padEnd(width)}  ${media.files} files, ${formatBytes(media.bytes)}`);
  return lines.join("\n") || "empty";
}

/** `tenon-<name>-2026-11-12-1530.zip`, with `name` reduced to letters, digits and dashes. */
export function archiveFileName(name: string, date = new Date()) {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "backup";
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `tenon-${slug}-${stamp}.zip`;
}

/** Thrown when the user cancels a prompt. The CLI exits with code 1 and no stack. */
export class Cancelled extends Error {}

/** @returns The answer of a clack prompt. @throws {Cancelled} When the user cancelled it. */
export async function answer<T>(prompt: Promise<T>): Promise<Exclude<T, symbol>> {
  const value = await prompt;
  if (isCancel(value)) throw new Cancelled("Cancelled");
  return value as Exclude<T, symbol>;
}

/**
 * Runs `work` behind a spinner that ends in every case: with `done(result)`, or as failed when `work` throws.
 * @param work Gets `update`, which replaces the spinner's message.
 */
export async function spinning<T>(
  message: string,
  work: (update: (message: string) => void) => Promise<T>,
  done: (result: T) => string,
) {
  const spin = spinner();
  spin.start(message);
  try {
    const result = await work((m) => spin.message(m));
    spin.stop(done(result));
    return result;
  } catch (error) {
    spin.error(message);
    throw error;
  }
}

/** Whether the CLI MAY ask: a terminal, and no `--yes`. */
export const canAsk = (flags: { yes?: boolean }) => !flags.yes && !!process.stdin.isTTY;
