import { ref } from "vue";
import { client, type Perspective } from "@/shared/api";
import { i18n } from "@/shared/i18n";
import { useLocale } from "./useLocale";

const switching = ref(false);
const error = ref("");

/** The value of the `integral-preview` cookie, or `null` when it is not set. */
export function readPerspective(): Perspective | null {
  const value = document.cookie.match(/(?:^|;\s*)integral-preview=([^;]*)/)?.[1];
  return value === "drafts" || value === "published" ? value : null;
}

/** Whether the admin reads drafts or published documents. `set()` reloads the page to read everything again. */
export function usePerspective() {
  const perspective = readPerspective() ?? "drafts";
  async function set(p: Perspective) {
    if (p === perspective || switching.value) return;
    switching.value = true;
    error.value = "";
    try {
      if (!(await useLocale().flush())) {
        error.value = i18n.global.t("documents.perspectiveUnsaved");
        return;
      }
      await client.preview.enter(p);
      location.reload();
    } catch (e) {
      error.value = (e as Error).message;
    } finally {
      switching.value = false;
    }
  }
  return { perspective, set, switching, error };
}
