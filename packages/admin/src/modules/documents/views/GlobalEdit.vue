<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { client, schema, type Data, type Fields } from "@/shared/api";
import DocForm from "@/modules/documents/components/DocForm.vue";
import { Pane } from "@/shared";

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
  <Pane v-if="global" :title="global.label ?? name" :min="448" grow :collapsible="false">
    <div v-if="data" class="flex min-h-full flex-col">
      <header class="mx-auto w-full max-w-2xl px-4 pt-8 pb-6">
        <p class="text-muted-foreground text-xs">Global</p>
        <h1 class="mt-1 text-2xl font-semibold">{{ global.label ?? name }}</h1>
        <p v-if="global.description" class="text-muted-foreground mt-2 text-sm">
          {{ global.description }}
        </p>
      </header>
      <DocForm
        id="global-form"
        class="flex-1"
        :fields="global.fields"
        :initial="data"
        :save="save"
      />
    </div>
  </Pane>
</template>
