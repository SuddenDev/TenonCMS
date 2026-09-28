<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { client, schema, type Data, type Fields } from "../api";
import DocForm from "../components/DocForm.vue";

const name = useRoute().params.name as string;
const global = computed(() => schema.value.globals?.[name]);
const data = ref<Record<string, unknown> | null>(null);

useHead({ title: () => global.value?.label ?? name });

client.getGlobal(name, { populate: false }).then((d) => (data.value = d));

async function save(body: Data<Fields>) {
  data.value = await client.setGlobal(name, body);
}
</script>

<template>
  <template v-if="global && data">
    <h1 class="mb-6 text-2xl font-semibold">{{ global.label ?? name }}</h1>
    <DocForm :fields="global.fields" :initial="data" :save="save" />
  </template>
</template>
