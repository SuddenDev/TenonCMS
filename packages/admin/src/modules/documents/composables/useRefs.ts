import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

/** `?ref=<collection>:<id>,…` opens referenced documents in panes to the right, one per hop. */
export function useRefs() {
  const route = useRoute();
  const router = useRouter();
  const refs = computed(() =>
    String(route.query.ref ?? "")
      .split(",")
      .filter(Boolean)
      .map((key) => {
        const [collection = "", id = ""] = key.split(":");
        return { key, collection, id };
      }),
  );
  function setRefs(keys: string[]) {
    const { ref: _, ...query } = route.query;
    router.push({ query: keys.length ? { ...query, ref: keys.join(",") } : query });
  }
  // A reference opened in pane `at` replaces every pane right of it. The main document is -1.
  const openAt = (at: number) => (collection: string, id: string) =>
    setRefs([...refs.value.slice(0, at + 1).map((r) => r.key), `${collection}:${id}`]);
  const closeAt = (at: number) => setRefs(refs.value.slice(0, at).map((r) => r.key));
  return { refs, openAt, closeAt };
}
