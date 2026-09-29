<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { client, schema, type Data, type Fields } from "@/shared/api";
import DocForm from "@/modules/documents/components/DocForm.vue";
import FormHeader from "@/modules/documents/components/FormHeader.vue";
import { Button } from "@/shared/components/ui/button";
import { useBreadcrumbs } from "@/shared/composables/useBreadcrumbs";

const name = useRoute().params.name as string;
const global = computed(() => schema.value.globals?.[name]);
const data = ref<Record<string, unknown> | null>(null);
const crumbs = useBreadcrumbs();
const back = computed(() => crumbs.value.at(-2)?.to ?? "/");

useHead({ title: () => global.value?.label ?? name });

client.getGlobal(name, { populate: false }).then((d) => (data.value = d));

async function save(body: Data<Fields>) {
  data.value = await client.setGlobal(name, body);
}
</script>

<template>
  <template v-if="global && data">
    <FormHeader :to="back" :title="global.label ?? name" :description="global.description">
      <Button type="submit" form="global-form">Save</Button>
    </FormHeader>
    <DocForm id="global-form" :fields="global.fields" :initial="data" :save="save" />
  </template>
</template>
