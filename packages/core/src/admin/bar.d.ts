import type { AdminBarContext, MountHandle } from "./index";

/**
 * Mounts the admin bar into `el`. The site's preview runtime calls it for signed-in editors.
 * @param el Usually a shadow root, so the host's CSS cannot reach the bar.
 * @returns `update` renders a new context, `unmount` removes the bar.
 */
export function mountAdminBar(
  el: HTMLElement | ShadowRoot,
  ctx: AdminBarContext,
): Required<MountHandle<AdminBarContext>>;
