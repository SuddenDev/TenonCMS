import { openAsBlob } from "node:fs";
import { styleText } from "node:util";
import * as p from "@clack/prompts";
import { readArchiveManifest } from "tenoncms/client";
import { backupCommand } from "./backup.command.ts";
import { openTarget, type TargetFlags } from "./target.ts";
import { Cancelled, answer, canAsk, formatBytes, formatCounts, spinning } from "./ui.ts";

export type RestoreFlags = TargetFlags & { "dry-run"?: boolean; yes?: boolean; backup?: boolean };

/**
 * `tenon restore <file>`: checks the archive against the target, shows what it deletes and writes, offers a backup,
 * asks once more, then replaces all data. `--dry-run` stops after the check. `--yes` skips the questions, and backs up
 * first only with `--backup`.
 */
export async function restoreCommand(file: string | undefined, flags: RestoreFlags) {
  if (!file) throw new Error("Usage: tenon restore <file>");
  const archive = await openAsBlob(file);
  const manifest = await readManifest(archive, file);
  const target = await openTarget(flags);

  const check = await spinning(
    `Checking ${file} against ${target.label}`,
    () => target.check(archive, manifest),
    () => `Checked ${file}`,
  );
  p.note(formatCounts(check.deletes), `Deleted at ${target.label}`);
  if (check.writes) p.note(formatCounts(check.writes), `Written from ${file}`);
  if (check.errors.length) {
    for (const error of check.errors) p.log.error(error);
    throw new Error("This archive cannot be restored here. Nothing was changed.");
  }
  if (flags["dry-run"]) {
    p.log.info("Dry run: nothing was changed.");
    return;
  }

  const who = manifest.scope === "full" ? ", users, API keys and sessions included" : "";
  p.log.warn(
    styleText(
      ["red", "bold"],
      `This replaces ALL data at ${target.label}${who}. It cannot be undone.`,
    ),
  );
  if (!flags.yes) {
    if (!canAsk(flags)) throw new Error("Pass --yes to restore without questions.");
    const first =
      flags.backup ??
      (await answer(p.confirm({ message: "Back up the current data first?", initialValue: true })));
    if (first) await backupCommand({}, target);
    const go = await answer(
      p.confirm({
        message: `Replace all data at ${target.label} with ${file}?`,
        initialValue: false,
      }),
    );
    if (!go) throw new Cancelled("Nothing was changed.");
  } else if (flags.backup) await backupCommand({ yes: true }, target);

  await spinning(
    `Restoring ${file}`,
    (update) => target.restore(archive, (n) => update(`Restoring ${file}: ${formatBytes(n)} sent`)),
    () => `Restored ${file} to ${target.label}`,
  );
  if (manifest.scope === "full" && target.remote)
    p.log.info(`Everyone was signed out. Run tenon login ${target.label} again.`);
}

async function readManifest(archive: Blob, file: string) {
  const manifest = await readArchiveManifest(archive);
  if (!manifest) throw new Error(`${file} is not a tenon archive.`);
  return manifest;
}
