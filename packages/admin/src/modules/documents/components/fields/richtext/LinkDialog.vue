<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { client, schema } from "@/shared/api";
import { titleField } from "@/modules/documents/fields";
import { useLocale } from "@/shared/composables/useLocale";
import { usePerspective } from "@/shared/composables/usePerspective";
import { text } from "@/shared/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import {
  Combobox,
  ComboboxAnchor,
  ComboboxInput,
  ComboboxList,
  ComboboxViewport,
  ComboboxGroup,
  ComboboxItemIndicator,
  ComboboxItem,
  ComboboxEmpty,
} from "@/shared/components/ui/combobox";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import Icon from "@/shared/components/Icon.vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import MediaField from "@/modules/media/components/MediaField.vue";
import { safeRichtextUrl } from "../../../../../../../core/src/richtext/runtime/validation";
import type {
  RichtextReference,
  RichtextTargets,
} from "../../../../../../../core/src/richtext/config/types";

const props = defineProps<{ attrs: Record<string, any> }>();
const emit = defineEmits<{ apply: [attrs: Record<string, any>, label: string]; remove: [] }>();
const open = defineModel<boolean>("open", { required: true });

const { t } = useI18n();
const { locale } = useLocale();
const { perspective } = usePerspective();

const query = ref("");
const href = ref("");
const reference = ref<RichtextReference>();
const referencePath = ref("");
const label = ref("");
const media = ref<string | null>(null);
const groups = ref<RichtextTargets>([]);

const target = ref("_self");
const targetOptions = [
  { value: "_self", label: t("richtext.sameTab") },
  { value: "_blank", label: t("richtext.newTab") },
  { value: "_parent", label: t("richtext.parentFrame") },
  { value: "_top", label: t("richtext.topFrame") },
];

const error = ref("");
const loading = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
let requests = 0;

watch(open, (value) => {
  if (!value) {
    requests++;
    clearTimeout(timer);
    return;
  }

  href.value = props.attrs.reference ? "" : (props.attrs.href ?? "");
  target.value = props.attrs.target ?? "_self";
  reference.value = props.attrs.reference;
  label.value = "";
  media.value = null;
  query.value = "";
  error.value = "";

  search();
});

watch([open, reference], async ([visible, selected], _, onCleanup) => {
  let active = true;
  onCleanup(() => (active = false));

  referencePath.value = "";
  if (!visible || !selected || selected.deleted) return;

  error.value = "";

  try {
    const options = { locale: locale.value, perspective };
    const doc = await client.findById(selected.collection, selected.id, {
      ...options,
      populate: false,
    });
    if (!active) return;

    const collection = schema.value.collections?.[selected.collection];
    const key = collection ? titleField(collection) : "";
    label.value = String(doc[key] || doc.id);

    const resolved = await client.richtext.resolve(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: selected.id,
                marks: [{ type: "link", attrs: { reference: selected } }],
              },
            ],
          },
        ],
      },
      options,
    );
    if (active)
      referencePath.value = resolved.content?.[0].content?.[0].marks?.[0].attrs?.href ?? "";
  } catch (e) {
    if (active && reference.value === selected) error.value = (e as Error).message;
  }
});

function search() {
  clearTimeout(timer);
  const request = ++requests;
  loading.value = true;

  timer = setTimeout(async () => {
    try {
      const found = await client.richtext.search({
        query: query.value,
        locale: locale.value,
        perspective,
      });
      if (request === requests) groups.value = found.filter((group) => group.items.length);
    } catch (e) {
      if (request === requests) error.value = (e as Error).message;
    } finally {
      if (request === requests) loading.value = false;
    }
  }, 200);
}

watch(query, () => {
  if (open.value) search();
});

onBeforeUnmount(() => {
  requests++;
  clearTimeout(timer);
});

function pick(value: unknown) {
  if (typeof value !== "string") return;

  const [collection, id] = JSON.parse(value) as [string, string];
  reference.value = { collection, id };
  label.value =
    groups.value.find((g) => g.collection === collection)?.items.find((i) => i.id === id)?.label ??
    id;

  href.value = "";
  media.value = null;
}

watch(media, (id) => {
  if (id) {
    reference.value = { collection: "media", id };
    href.value = "";
  }
});

function apply() {
  const url = href.value.trim();
  if (!reference.value && (!url || !safeRichtextUrl(url))) {
    error.value = t("richtext.invalidUrl");
    return;
  }

  emit(
    "apply",
    {
      href: reference.value ? null : url,
      reference: reference.value ?? null,
      target: target.value,
      rel: target.value === "_blank" ? "noopener noreferrer" : null,
    },
    label.value || url || t("richtext.link"),
  );
  open.value = false;
}
</script>
<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-xl" :aria-describedby="undefined">
      <DialogHeader
        ><DialogTitle class="text-2xl">{{ t("richtext.link") }}</DialogTitle></DialogHeader
      >

      <form class="flex flex-col gap-8" @submit.prevent="apply">
        <Tabs default-value="relation">
          <TabsList>
            <TabsTrigger value="relation" type="button">
              {{ t("richtext.linkRelation") }}
            </TabsTrigger>
            <TabsTrigger value="direct" type="button">
              {{ t("richtext.linkDirect") }}
            </TabsTrigger>
            <TabsTrigger value="file" type="button">
              {{ t("richtext.linkFile") }}
            </TabsTrigger>
          </TabsList>

          <!-- internal link -->
          <TabsContent value="relation" class="flex flex-col gap-6">
            <div class="flex flex-col gap-2">
              <Label>{{ t("richtext.internalLink") }}</Label>

              <div
                v-if="reference"
                class="bg-muted flex items-center justify-between gap-2 rounded-md p-2 text-sm"
              >
                <div>
                  <div class="mb-1 font-medium" :title="`${reference.collection}:${reference.id}`">
                    {{ label || `${reference.collection}:${reference.id}` }}
                  </div>
                  <div v-if="referencePath" class="text-muted-foreground text-xs break-all">
                    {{ referencePath }}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  @click="
                    reference = undefined;
                    media = null;
                    query = '';
                  "
                  >{{ t("common.remove") }}</Button
                >
              </div>

              <Combobox v-else ignore-filter open-on-focus open-on-click @update:model-value="pick">
                <ComboboxAnchor class="w-full"
                  ><ComboboxInput
                    v-model="query"
                    :aria-label="t('richtext.searchLinks')"
                    :placeholder="t('richtext.searchLinks')"
                /></ComboboxAnchor>
                <ComboboxList
                  ><ComboboxViewport>
                    <ComboboxEmpty>{{
                      t(loading ? "common.loading" : "common.noMatches")
                    }}</ComboboxEmpty>
                    <ComboboxGroup
                      v-for="group in groups"
                      :key="group.collection"
                      :heading="text(group.label)"
                    >
                      <ComboboxItem
                        v-for="item in group.items"
                        :key="item.id"
                        :value="JSON.stringify([group.collection, item.id])"
                        >{{ item.label }}
                        <ComboboxItemIndicator>
                          <Icon name="check" />
                        </ComboboxItemIndicator>
                      </ComboboxItem>
                    </ComboboxGroup> </ComboboxViewport
                ></ComboboxList>
              </Combobox>
            </div>

            <!-- link target -->
            <label class="flex flex-col gap-2 text-sm"
              >{{ t("richtext.target") }}

              <select
                v-model="target"
                class="border-input bg-background h-9 rounded-md border px-3"
              >
                <option v-for="target of targetOptions" :key="target.value" :value="target.value">
                  {{ target.label }}
                </option>
              </select>
            </label>
          </TabsContent>

          <!-- external / direct url -->
          <TabsContent value="direct" class="flex flex-col gap-6">
            <label class="flex flex-col gap-2 text-sm"
              >{{ t("richtext.url") }}
              <Input
                v-model="href"
                placeholder="https://example.com or mailto:"
                @input="
                  reference = undefined;
                  media = null;
                "
              />
            </label>

            <!-- link target -->
            <label class="flex flex-col gap-2 text-sm"
              >{{ t("richtext.target") }}
              <select
                v-model="target"
                class="border-input bg-background h-9 rounded-md border px-3"
              >
                <option value="_self">{{ t("richtext.sameTab") }}</option>
                <option value="_blank">{{ t("richtext.newTab") }}</option>
                <option value="_parent">{{ t("richtext.parentFrame") }}</option>
                <option value="_top">{{ t("richtext.topFrame") }}</option>
              </select>
            </label>
          </TabsContent>

          <!-- file / media download -->
          <TabsContent value="file">
            <div v-if="schema.media" class="flex flex-col gap-3">
              <Label>{{ t("richtext.fileLink") }}</Label
              ><MediaField v-model="media" :field="{ type: 'file' }" />
            </div>
          </TabsContent>
        </Tabs>

        <p v-if="error" class="text-destructive text-sm" role="alert">{{ error }}</p>

        <DialogFooter>
          <Button
            v-if="reference || href || media"
            type="button"
            variant="ghost"
            @click="
              emit('remove');
              open = false;
            "
          >
            {{ t("richtext.unlink") }}
          </Button>
          <Button type="submit">
            {{ t("richtext.addLink") }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
