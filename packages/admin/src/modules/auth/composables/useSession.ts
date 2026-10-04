import { onMounted, onUnmounted, ref } from "vue";
import { client, schema, type Session } from "@/shared/api";
import { readPerspective } from "@/shared/composables/usePerspective";

/** The signed-in user and the schema. `schema` fills in once a session exists. */
export function useSession() {
  const user = ref<Session["user"] | null>(null);
  const loading = ref(true);

  async function load() {
    // `/schema` answers 401 without a session, so both requests can run at once.
    const [session, s] = await Promise.all([
      client.getSession(),
      client.getSchema().catch(() => undefined),
    ]);
    // The preview cookie lets the admin's reads, and every preview it opens, see drafts.
    // An existing cookie holds the editor's choice of perspective.
    if (session?.user && !readPerspective()) await client.preview.enter().catch(console.error);
    user.value = session?.user ?? null;
    if (user.value && s) schema.value = s;
    loading.value = false;
  }

  // The config can change while the admin is open, e.g. when editing integral.config.ts in dev.
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

  onMounted(() => {
    load();
    window.addEventListener("focus", refreshSchema);
  });
  onUnmounted(() => window.removeEventListener("focus", refreshSchema));

  return { user, loading, load, signOut };
}
