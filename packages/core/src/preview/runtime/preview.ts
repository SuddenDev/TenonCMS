import type { Unsubscribe, PreviewOptions } from "../config/types.ts";
import { startAdminBar } from "./admin-bar.ts";
import { hasSessionHint } from "./site-api.ts";

let stop: Unsubscribe | undefined;

/**
 * Starts the preview runtime. The mode comes from `window.name`:
 * - `tenon-preview` (the admin's iframe): live preview.
 * - `tenon-preview-…` (a preview the admin opened in a tab): live preview and the admin bar with an edit switch.
 * - Anything else: the admin bar, but only with the session hint cookie and a session. Otherwise it does nothing.
 *
 * The live preview loads on demand, so visitors without a session do not download it.
 * Calling it again returns the same stop function.
 */
export const preview: (options?: PreviewOptions) => Unsubscribe = ({
  morph = false,
  admin = "/admin",
} = {}) => {
  if (stop) return stop;
  const name = globalThis.window?.name;
  if (name === undefined) return () => {};

  // The admin's own page MAY load this too (Astro injects it into every page).
  const onAdminPage = admin && (location.pathname + "/").startsWith(`${admin}/`);
  if (onAdminPage) {
    if (name.startsWith("tenon-preview-")) window.name = "";
    return () => {};
  }
  if (name.startsWith("tenon-preview")) {
    return track(lazy(() => import("./live.ts").then((m) => m.startLive(name, morph, admin))));
  }
  if (!admin || !hasSessionHint()) return () => {};
  return track(startAdminBar("site", admin).stop);
};

// Keeps the running stop function, so a second `preview()` returns it.
const track = (cleanup: Unsubscribe) =>
  (stop = () => {
    stop = undefined;
    cleanup();
  });

// Starts the live preview once its chunk has loaded. A stop before that stops it right after.
const lazy = (start: () => Promise<Unsubscribe>): Unsubscribe => {
  let stopped = false;
  let cleanup: Unsubscribe | undefined;
  void start().then((fn) => (stopped ? fn() : (cleanup = fn)));
  return () => {
    stopped = true;
    cleanup?.();
  };
};
