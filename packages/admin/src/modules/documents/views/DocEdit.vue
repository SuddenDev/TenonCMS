<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import DocPane from "@/modules/documents/components/DocPane.vue";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";

const route = useRoute();
const router = useRouter();
const name = route.params.name as string;
const id = route.params.id as string;

// `?ref=<collection>:<id>,…` opens referenced documents in panes to the right, one per hop.
const refs = computed(() =>
  String(route.query.ref ?? "")
    .split(",")
    .filter(Boolean)
    .map((key) => {
      const [collection = "", refId = ""] = key.split(":");
      return { key, collection, id: refId };
    }),
);
function setRefs(keys: string[]) {
  const { ref: _, ...query } = route.query;
  router.push({ query: keys.length ? { ...query, ref: keys.join(",") } : query });
}
// A reference opened in pane `at` replaces every pane right of it. The main document is -1.
const openAt = (at: number) => (collection: string, refId: string) =>
  setRefs([...refs.value.slice(0, at + 1).map((r) => r.key), `${collection}:${refId}`]);
const closeAt = (at: number) => setRefs(refs.value.slice(0, at).map((r) => r.key));
</script>

<template>
  <DocPane :name="name" :id="id" :open="openAt(-1)" @deleted="router.push(`/collections/${name}`)">
    <template #actions>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Close"
        @click="router.push(`/collections/${name}`)"
      >
        <Icon name="x" />
      </Button>
    </template>
  </DocPane>
  <DocPane
    v-for="(r, i) in refs"
    :key="`${i}:${r.key}`"
    :name="r.collection"
    :id="r.id"
    :open="openAt(i)"
    closable
    @close="closeAt(i)"
    @deleted="closeAt(i)"
  />
</template>
