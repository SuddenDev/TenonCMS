import { existsSync, statSync } from "node:fs";
import * as p from "@clack/prompts";
import type { ExportOptions } from "../client/index.ts";
import { openTarget, type Target, type TargetFlags } from "./target.ts";
import { answer, archiveFileName, canAsk, formatBytes, formatCounts, spinning } from "./ui.ts";

export type BackupFlags = TargetFlags & {
  out?: string;
  "dry-run"?: boolean;
  yes?: boolean;
  "content-only"?: boolean;
  media?: boolean;
};

/**
 * `tenon backup`: shows what the archive will hold, asks for the file name, then writes it. A full archive unless
 * `--content-only`. `--dry-run` stops before writing.
 * @param target An open target, when `tenon restore` backs up first.
 * @returns The file written, or `undefined` for a dry run.
 */
export async function backupCommand(flags: BackupFlags, target?: Target) {
  target ??= await openTarget(flags);
  const options: ExportOptions = {
    scope: flags["content-only"] ? "content" : "full",
    media: flags.media !== false,
  };

  const summary = await spinning(
    `Reading ${target.label}`,
    () => target.summary(options),
    () => `${options.scope === "full" ? "Full backup" : "Content backup"} of ${target.label}`,
  );
  p.note(formatCounts(summary), "The archive will hold");

  const suggested = archiveFileName(target.name);
  const file =
    flags.out ??
    (canAsk(flags)
      ? await answer(p.text({ message: "File name", initialValue: suggested, validate: required }))
      : suggested);
  if (flags["dry-run"]) {
    p.log.info(`Dry run: would write ${file}. Nothing was written.`);
    return undefined;
  }
  if (existsSync(file) && !flags.yes) {
    if (!canAsk(flags)) throw new Error(`${file} exists. Pass --yes to overwrite it.`);
    const overwrite = await answer(
      p.confirm({ message: `${file} exists. Overwrite it?`, initialValue: false }),
    );
    if (!overwrite) throw new Error(`${file} was left as it is.`);
  }

  await spinning(
    `Writing ${file}`,
    (update) => target.exportTo(file, options, (n) => update(`Writing ${file}: ${formatBytes(n)}`)),
    () => `Wrote ${file} (${formatBytes(statSync(file).size)})`,
  );
  return file;
}

const required = (value: string | undefined) => (value?.trim() ? undefined : "Enter a file name");
