<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { useIntervalFn } from "@vueuse/core";
import { computed, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import type { CronEntry, Job, JobStatus } from "../../../../../core/src/jobs/types";
import { client, schema } from "@/shared/api";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/shared/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import CronTable from "../components/CronTable.vue";
import JobsTable from "../components/JobsTable.vue";
import type { JobAction } from "../jobs";

const { t } = useI18n();
useHead({ title: () => t("nav.jobs") });

const tabs = [
  { value: "upcoming", status: "queued" },
  { value: "running", status: "running" },
  { value: "failed", status: "failed" },
  { value: "done", status: "done" },
] as const satisfies readonly { value: string; status: JobStatus }[];

const tab = ref<string>("upcoming");
const task = ref("");
const jobs = shallowRef<Job[]>([]);
const cron = shallowRef<CronEntry[]>([]);
const busy = ref("");
const tasks = computed(() => schema.value.jobs ?? []);

// A later load wins, so a quick switch between tabs shows the last one.
let loads = 0;
async function load() {
  const at = ++loads;
  try {
    if (tab.value === "cron") {
      const entries = await client.jobs.cron();
      if (at === loads) cron.value = entries;
    } else {
      const status = tabs.find((x) => x.value === tab.value)!.status;
      const list = await client.jobs.list({ status, task: task.value || undefined });
      if (at === loads) jobs.value = list;
    }
  } catch (e) {
    if (at === loads) toast.error((e as Error).message);
  }
}
watch([tab, task], () => {
  jobs.value = [];
  load();
});
load();
useIntervalFn(load, 10_000);

const entries = computed(() =>
  task.value ? cron.value.filter((entry) => entry.task === task.value) : cron.value,
);

const run = { run: client.jobs.run, retry: client.jobs.retry, cancel: client.jobs.cancel };
async function act(action: JobAction, job: Job) {
  if (action === "cancel" && !confirm(t("jobs.cancelConfirm"))) return;

  busy.value = job.id;
  try {
    await run[action](job.id);
  } catch (e) {
    toast.error((e as Error).message);
  } finally {
    busy.value = "";
    await load();
  }
}
</script>

<template>
  <div class="flex flex-col gap-4 p-4">
    <Tabs v-model="tab">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger v-for="x in tabs" :key="x.value" :value="x.value">
            {{ t(`jobs.tabs.${x.value}`) }}
          </TabsTrigger>
          <TabsTrigger value="cron">{{ t("jobs.tabs.cron") }}</TabsTrigger>
        </TabsList>
        <div class="flex items-center gap-2">
          <NativeSelect v-model="task" :aria-label="t('jobs.filterTask')" size="sm">
            <NativeSelectOption value="">{{ t("jobs.allTasks") }}</NativeSelectOption>
            <NativeSelectOption
              v-for="x in tasks"
              :key="x.name"
              :value="x.name"
              :title="x.description"
            >
              {{ x.name }}
            </NativeSelectOption>
          </NativeSelect>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :aria-label="t('jobs.refresh')"
            @click="load"
          >
            <Icon name="refresh-cw" />
          </Button>
        </div>
      </div>
      <TabsContent v-for="x in tabs" :key="x.value" :value="x.value" class="border-0 p-0">
        <JobsTable :jobs="jobs" :busy="busy" @action="act" />
      </TabsContent>
      <TabsContent value="cron" class="border-0 p-0">
        <CronTable :entries="entries" />
        <p class="text-muted-foreground mt-3 text-xs">{{ t("jobs.cronNote") }}</p>
      </TabsContent>
    </Tabs>
  </div>
</template>
