import * as p from "@clack/prompts";
import { loadConfig, type TargetFlags } from "../target.ts";

export type MediaFlags = TargetFlags & { force?: boolean };

type RegenerateResult = { rendered: number; removed: number; needsThumbnail?: number };

/**
 * `tenon media regenerate [--force]`: brings stored image variants in line with `media.images` after a config change.
 * `--force` renders every variant again. Local only: it renders with the project's provider and storage, so a config
 * that runs only on Cloudflare calls `cms.media.regenerate()` there instead.
 */
export async function mediaCommand(action: string | undefined, flags: MediaFlags) {
  if (action !== "regenerate") throw new Error("Usage: tenon media regenerate [--force]");
  if (flags.url ?? process.env.TENON_URL)
    throw new Error(
      "tenon media regenerate works on the local project only. Run it where tenon.config.ts reaches the database and storage.",
    );
  const cms = await loadConfig(flags.config);
  if (!cms.media) throw new Error("The media library is off (`media: false`).");

  const spin = p.spinner();
  spin.start(flags.force ? "Rendering every image again" : "Regenerating images");
  const result = await cms.media.regenerate(undefined, { force: flags.force }).catch((error) => {
    spin.error("Regenerating images");
    throw error;
  });
  const report = regenerateReport(result!);
  spin.stop(report.done);
  if (report.previews) p.log.info(report.previews);
}

/** What `tenon media regenerate` prints. `previews` is set when images without a provider have no admin preview yet. */
export function regenerateReport({ rendered, removed, needsThumbnail = 0 }: RegenerateResult) {
  const done =
    rendered && removed
      ? `Rendered ${rendered} variants, removed ${removed}`
      : rendered
        ? `Rendered ${rendered} variants`
        : removed
          ? `Removed ${removed} variants`
          : "Nothing to do";
  const previews = needsThumbnail
    ? `${needsThumbnail} images have no preview in the admin. The browser makes them: open Media in the admin and choose "Create missing previews".`
    : undefined;
  return previews ? { done, previews } : { done };
}
