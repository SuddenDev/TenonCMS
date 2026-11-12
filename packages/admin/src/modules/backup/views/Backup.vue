<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import type { ImportMode } from "../../../../../core/src/transfer/format";
import { client, CmsError, schema } from "@/shared/api";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/shared/components/ui/native-select";
import { Switch } from "@/shared/components/ui/switch";
import ConfirmDialog from "@/modules/users/components/ConfirmDialog.vue";

const { t } = useI18n();
useHead({ title: () => t("nav.backup") });

const hasMedia = computed(() => !!schema.value.collections?.media);
const withMedia = ref(true);
const exporting = ref(false);

async function download() {
  exporting.value = true;
  try {
    window.location.assign(await client.exportLink({ media: hasMedia.value && withMedia.value }));
  } catch (e) {
    toast.error((e as Error).message);
  } finally {
    exporting.value = false;
  }
}

const modes: ImportMode[] = ["replace", "merge", "missing"];
const mode = ref<ImportMode>("replace");
const file = ref<File>();
const fileInput = ref<HTMLInputElement>();
const busy = ref(false);
const progress = ref<number>();
const confirming = ref(false);

function pick(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0];
}

async function restore() {
  if (!file.value) return;
  confirming.value = false;
  busy.value = true;
  try {
    const counts = await client.import(file.value, {
      mode: mode.value,
      onProgress: ({ loaded, total }) => (progress.value = Math.round((loaded / total) * 100)),
    });
    toast.success(t("backup.restored", { documents: counts.cms_documents, media: counts.media }));
  } catch (e) {
    toast.error(
      e instanceof CmsError && e.status === 413 ? t("backup.tooLarge") : (e as Error).message,
    );
  } finally {
    busy.value = false;
    progress.value = undefined;
  }
}

const restoreLabel = computed(() => {
  if (!busy.value) return t("backup.restoreAction");
  if (progress.value === undefined || progress.value === 100) return t("backup.importing");
  return t("backup.uploading", { percent: progress.value });
});
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-4 p-4">
    <Card>
      <CardHeader>
        <CardTitle>{{ t("backup.download") }}</CardTitle>
        <CardDescription>{{ t("backup.downloadText") }}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup class="gap-6">
          <label v-if="hasMedia" class="flex items-center gap-2 text-sm">
            <Switch v-model="withMedia" />
            {{ t("backup.includeMedia") }}
          </label>
          <Button class="justify-self-start" :disabled="exporting" @click="download">
            <Icon v-if="exporting" name="loader-circle" class="animate-spin" />
            {{ t(exporting ? "backup.preparing" : "backup.downloadAction") }}
          </Button>
        </FieldGroup>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>{{ t("backup.restore") }}</CardTitle>
        <CardDescription>{{ t("backup.restoreText") }}</CardDescription>
      </CardHeader>
      <CardContent>
        <form :aria-busy="busy" @submit.prevent="confirming = true">
          <FieldGroup class="gap-6">
            <fieldset :disabled="busy" class="contents">
              <Field>
                <FieldLabel>{{ t("backup.file") }}</FieldLabel>
                <div class="flex items-center gap-3">
                  <Button type="button" variant="outline" @click="fileInput?.click()">
                    {{ t("backup.choose") }}
                  </Button>
                  <span class="text-muted-foreground truncate text-sm">
                    {{ file?.name ?? t("backup.noFile") }}
                  </span>
                </div>
                <input
                  ref="fileInput"
                  type="file"
                  class="hidden"
                  accept=".zip,application/zip"
                  @change="pick"
                />
              </Field>
              <Field>
                <FieldLabel for="backup-mode">{{ t("backup.mode") }}</FieldLabel>
                <NativeSelect id="backup-mode" v-model="mode" class="w-full">
                  <NativeSelectOption v-for="m in modes" :key="m" :value="m">
                    {{ t(`backup.modes.${m}`) }}
                  </NativeSelectOption>
                </NativeSelect>
                <FieldDescription>{{ t(`backup.modeHints.${mode}`) }}</FieldDescription>
              </Field>
            </fieldset>
            <Button
              type="submit"
              class="justify-self-start"
              :variant="mode === 'replace' ? 'destructive' : 'default'"
              :disabled="busy || !file"
            >
              <Icon v-if="busy" name="loader-circle" class="animate-spin" />
              {{ restoreLabel }}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>

    <p class="text-muted-foreground text-sm">{{ t("backup.notIncluded") }}</p>

    <ConfirmDialog
      v-model:open="confirming"
      :title="t('backup.confirmTitle')"
      :text="t(`backup.confirm.${mode}`)"
      :action="t('backup.restoreAction')"
      :destructive="mode === 'replace'"
      @confirm="restore"
    />
  </div>
</template>
