import { configureKey } from "@/shared/options";
import { inject, onMounted, onUnmounted, ref, watch } from "vue";
import { client, schema, type Session } from "@/shared/api";
import { readPerspective } from "@/shared/composables/usePerspective";
import { useTimeZone } from "@/shared/composables/useTimeZone";
import { useAdminLocale } from "@/shared/i18n";
import { updateUser } from "../account";

/** The signed-in user and the schema. `schema` fills in once a session exists. */
export function useSession() {
  const configure = inject(configureKey, async () => {});
  const error = ref("");
  const user = ref<Session["user"] | null>(null);
  const loading = ref(true);
  const { locale, locales } = useAdminLocale();
  const { preferred } = useTimeZone();

  async function load() {
    error.value = "";
    // `/schema` answers 401 without a session, so both requests can run at once.
    const [session, s] = await Promise.all([
      client.getSession(),
      client.getSchema().catch(() => undefined),
    ]);
    // The preview cookie lets the admin's reads, and every preview it opens, see drafts.
    // An existing cookie holds the editor's choice of perspective.
    if (session?.user && !readPerspective())
      await client.preview.enter("drafts").catch(console.error);
    try {
      if (session?.user && s?.admin) await configure(s.admin);
    } catch (e) {
      error.value = (e as Error).message;
      loading.value = false;
      return;
    }
    user.value = session?.user ?? null;
    preferred.value = user.value?.timezone ?? null;
    const language = (locales as readonly string[]).find((l) => l === user.value?.language);
    if (language) locale.value = language as typeof locale.value;
    if (user.value && s) schema.value = s;
    loading.value = false;
  }

  // A language chosen anywhere in the admin follows the user to other browsers.
  watch(locale, (language) => {
    if (!user.value || user.value.language === language) return;
    user.value.language = language;
    updateUser({ language }).catch(console.error);
  });

  // The config can change while the admin is open, e.g. when editing tenon.config.ts in dev.
  // Unchanged responses are skipped, so a refresh does not re-render open forms.
  function refreshSchema() {
    if (!user.value || document.hidden) return;
    client.getSchema().then((s) => {
      if (JSON.stringify(s) !== JSON.stringify(schema.value)) schema.value = s;
    }, load);
  }

  async function signOut() {
    await client.preview.exit().catch(console.error);
    await client.signOut();
    user.value = null;
  }

  // A 401 from an authenticated route means the session is gone. The sign-in replaces the layout, which stops every extension.
  function expire() {
    user.value = null;
  }

  onMounted(() => {
    load();
    window.addEventListener("focus", refreshSchema);
  });
  onUnmounted(() => window.removeEventListener("focus", refreshSchema));

  return { user, loading, load, signOut, expire, error };
}
