import { client, type Perspective } from "@/shared/api";

/** The value of the `integral-preview` cookie, or `null` when it is not set. */
export function readPerspective(): Perspective | null {
  const value = document.cookie.match(/(?:^|;\s*)integral-preview=([^;]*)/)?.[1];
  return value === "drafts" || value === "published" ? value : null;
}

/** Whether the admin reads drafts or published documents. `set()` reloads the page to read everything again. */
export function usePerspective() {
  const perspective = readPerspective() ?? "drafts";
  async function set(p: Perspective) {
    await client.preview.enter(p);
    location.reload();
  }
  return { perspective, set };
}
