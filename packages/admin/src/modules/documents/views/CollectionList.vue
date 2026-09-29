<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { client, schema } from "@/shared/api";
import { titleField } from "@/modules/documents/fields";

const name = useRoute().params.name as string;
const collection = computed(() => schema.value.collections?.[name]);
const docs = ref<Record<string, any>[]>([]);

useHead({ title: () => collection.value?.label ?? name });

client.find(name, { populate: false }).then((d) => (docs.value = d));
</script>

<template>
  <template v-if="collection">
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-semibold">{{ collection.label ?? name }}</h1>
      <RouterLink :to="`/collections/${name}/new`" class="btn">New</RouterLink>
    </div>
    <ul class="divide-border border-border bg-card divide-y rounded-lg border">
      <li v-for="doc in docs" :key="doc.id">
        <RouterLink
          :to="`/collections/${name}/${doc.id}`"
          class="hover:bg-muted flex justify-between px-4 py-3 text-sm"
        >
          <span>{{ doc[titleField(collection)] || "(untitled)" }}</span>
          <span class="text-muted-foreground">{{
            new Date(doc.updatedAt as string).toLocaleString()
          }}</span>
        </RouterLink>
      </li>
      <li v-if="!docs.length" class="text-muted-foreground px-4 py-3 text-sm">Nothing here yet.</li>
    </ul>
  </template>
</template>
