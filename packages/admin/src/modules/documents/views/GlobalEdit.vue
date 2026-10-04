<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { client, schema, type Data, type Fields } from "@/shared/api";
import DocForm from "@/modules/documents/components/DocForm.vue";
import StatusBadges from "@/modules/documents/components/StatusBadges.vue";
import { Icon, Pane, usePerspective } from "@/shared";
import { Button } from "@/shared/components/ui/button";

// `previewing`: the pane sits next to the preview, so it shows no preview button.
withDefaults(
  defineProps<{
    previewing?: boolean;
    min?: number;
    max?: number;
    grow?: boolean;
    width?: number;
    handle?: "left" | "right";
  }>(),
  { min: 448, grow: true, width: undefined, handle: "right" },
);
// `saved`: after every save, draft save, publish and discard.
const emit = defineEmits<{ saved: []; change: [data: Record<string, unknown>] }>();
const name = useRoute().params.name as string;
const global = computed(() => schema.value.globals?.[name]);
const drafts = computed(() => global.value?.drafts !== false);
// The Published view shows the live version. An edit there would replace the pending draft, so the form is inert.
const readOnly = computed(() => drafts.value && usePerspective().perspective === "published");
// `doc` is the latest saved global. `data` is what the form shows; a draft save leaves it, so typing goes on.
const doc = ref<Record<string, unknown> | null>(null);
const data = ref<Record<string, unknown>>({});

useHead({ title: () => global.value?.label ?? name });

function show(d: Record<string, unknown>) {
  doc.value = d;
  data.value = d;
  emit("saved");
}

client.getGlobal(name, { populate: false }).then((d) => (doc.value = data.value = d));

const save = async (body: Data<Fields>) => show(await client.setGlobal(name, body));
const publish = async () => show(await client.publishGlobal(name));
const discard = async () => show(await client.discardGlobal(name));

async function saveDraft(body: Data<Fields>) {
  doc.value = await client.setGlobalDraft(name, body);
  emit("saved");
}
</script>

<template>
  <Pane
    v-if="global"
    :title="global.label ?? name"
    :min="min"
    :max="max"
    :grow="grow"
    :width="width"
    :handle="handle"
    :collapsible="false"
  >
    <template #actions>
      <Button
        v-if="global.preview && !previewing"
        as-child
        variant="ghost"
        size="icon-sm"
        aria-label="Preview"
      >
        <RouterLink :to="`/presentation/globals/${name}`"><Icon name="eye" /></RouterLink>
      </Button>
      <slot name="actions" />
    </template>
    <div v-if="doc" class="flex min-h-full flex-col">
      <header class="mx-auto w-full max-w-2xl px-4 pt-8 pb-6">
        <p class="text-muted-foreground text-xs">Global</p>
        <h1 class="mt-1 text-2xl font-semibold">{{ global.label ?? name }}</h1>
        <StatusBadges v-if="drafts" :doc="doc" />
        <p v-if="readOnly" class="text-muted-foreground mt-2 text-sm">
          Published version. Switch to Drafts to edit.
        </p>
        <p v-if="global.description" class="text-muted-foreground mt-2 text-sm">
          {{ global.description }}
        </p>
      </header>
      <DocForm
        id="global-form"
        class="flex-1 inert:opacity-60"
        :fields="global.fields"
        :initial="data"
        :doc="doc"
        :inert="readOnly"
        global
        v-bind="drafts ? { saveDraft, publish, discard } : { save }"
        @change="emit('change', $event)"
      />
    </div>
  </Pane>
</template>
