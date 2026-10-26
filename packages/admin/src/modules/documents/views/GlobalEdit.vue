<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, provide, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { text } from "@/shared/i18n";
import { useRoute } from "vue-router";
import { client, schema, type Data, type Fields } from "@/shared/api";
import { can } from "@/shared/access";
import { ownerKey } from "@/modules/documents/fields";
import DocForm from "@/modules/documents/components/DocForm.vue";
import LocaleActions from "@/modules/documents/components/LocaleActions.vue";
import StatusBadges from "@/modules/documents/components/StatusBadges.vue";
import { useTranslations } from "@/modules/documents/composables/useTranslations";
import { Icon, Pane, useLocale, usePerspective } from "@/shared";
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
const { t } = useI18n();
const name = useRoute().params.name as string;
const global = computed(() => schema.value.globals?.[name]);
provide(
  ownerKey,
  computed(() => ({ global: name })),
);
const drafts = computed(() => global.value?.drafts !== false);
// The Published view shows the live version. An edit there would replace the pending draft, so the form is inert.
// It is inert, too, when the user MAY NOT change the global.
const editable = computed(() => can(global.value, "update"));
const readOnly = computed(
  () => !editable.value || (drafts.value && usePerspective().perspective === "published"),
);
// `doc` is the latest saved global. `data` is what the form shows; a draft save leaves it, so typing goes on.
const doc = ref<Record<string, unknown> | null>(null);
const data = ref<Record<string, unknown>>({});

useHead({ title: () => text(global.value?.label) ?? name });

const error = ref("");
const { locale, defaultLocale, flush } = useLocale();
const tr = useTranslations(
  () => global.value,
  () => ({ global: name }),
  () => doc.value,
);
const languages = computed(() =>
  tr.localized.value && tr.loaded.value ? tr.status.value : undefined,
);

function show(d: Record<string, unknown>) {
  doc.value = d;
  data.value = d;
  emit("saved");
}

// A later load wins, so a quick language switch shows the last one.
let loads = 0;
async function load() {
  const at = ++loads;
  const d = await client.getGlobal(name, { populate: false, ...tr.read() });
  if (at !== loads) return;

  doc.value = data.value = d;
  tr.refresh();
}
load();

// The form unmounts meanwhile, so no edit lands in the wrong language.
watch(tr.active, () => {
  doc.value = null;
  load();
});

const save = async (body: Data<Fields>) => show(await client.setGlobal(name, body, tr.write()));
const publish = async () => {
  show(await client.publishGlobal(name, tr.write()));
  tr.refresh();
};
const discard = async () => {
  show(await client.discardGlobal(name, tr.write()));
  tr.refresh();
};

async function saveDraft(body: Data<Fields>) {
  // The first save of a language creates its row.
  const first = languages.value?.active === "missing";

  doc.value = await client.setGlobalDraft(name, body, tr.write());
  if (first) tr.refresh();
  emit("saved");
}

// A language action saves the pending edit first, so no autosave lands after it.
async function translate(action: () => Promise<void>) {
  error.value = "";

  try {
    await flush();
    await action();
    emit("saved");
  } catch (e) {
    error.value = (e as Error).message;
  }
}

const copy = (from: string, to: string) =>
  translate(async () => {
    await tr.copy(from, to);
    if (to === tr.active.value) await load();
    else await tr.refresh();
  });

const removeLocale = (l: string) =>
  translate(async () => {
    await tr.remove(l);
    // The active language is gone: the switch loads the default one.
    locale.value = defaultLocale.value;
  });

const discardAll = () =>
  translate(async () => {
    await tr.discardAll();
    await load();
  });
</script>

<template>
  <Pane
    v-if="global"
    :title="text(global.label) ?? name"
    :min="min"
    :max="max"
    :grow="grow"
    :width="width"
    :handle="handle"
    :collapsible="false"
  >
    <template #title>
      <div class="min-w-0 flex-1">
        <h2 :class="drafts ? 'sr-only' : 'truncate text-sm font-medium'">
          {{ text(global.label) ?? name }}
        </h2>
        <StatusBadges v-if="doc && drafts" :doc="doc" :languages="languages" />
      </div>
    </template>
    <template #actions>
      <Button
        v-if="global.preview && !previewing"
        as-child
        variant="ghost"
        size="icon-sm"
        :aria-label="t('common.preview')"
      >
        <RouterLink :to="`/presentation/globals/${name}`"><Icon name="eye" /></RouterLink>
      </Button>
      <LocaleActions
        v-if="languages && !readOnly"
        :languages="languages"
        :locale="tr.active.value!"
        :default-locale="defaultLocale!"
        @copy="copy"
        @remove="removeLocale"
        @discard-all="discardAll"
      />
      <slot name="actions" />
    </template>
    <div v-if="doc" class="flex min-h-full flex-col">
      <header
        class="mx-auto w-full max-w-2xl px-6 pt-10 pb-8 group-data-[expanded=true]/pane:max-w-none sm:px-8"
      >
        <p class="text-muted-foreground text-xs">{{ t("documents.global") }}</p>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight">{{ text(global.label) ?? name }}</h1>
        <p v-if="error" class="text-destructive mt-2 text-sm" role="alert">{{ error }}</p>
        <p v-if="readOnly" class="text-muted-foreground mt-2 text-sm">
          {{ t(editable ? "documents.readOnly" : "documents.noEdit") }}
        </p>
        <p v-if="global.description" class="text-muted-foreground mt-2 text-sm">
          {{ text(global.description) }}
        </p>
      </header>
      <DocForm
        id="global-form"
        class="flex-1 inert:opacity-60"
        :fields="global.fields"
        :layout="global"
        :initial="data"
        :doc="doc"
        :inert="readOnly"
        global
        :localized="tr.localized.value"
        :defaults="tr.defaults.value"
        :missing="languages?.active === 'missing'"
        v-bind="drafts ? { saveDraft, publish, discard } : { save }"
        @change="emit('change', $event)"
      />
    </div>
  </Pane>
</template>
