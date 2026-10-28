<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { onMounted, provide, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { toast } from "vue-sonner";
import type { ApiKey, NewApiKey } from "../../../../../core/src/client";
import { client } from "@/shared/api";
import { Icon, Pane, PaneMenu, PaneMenuItem, PaneMenuSkeleton } from "@/shared";
import { Button } from "@/shared/components/ui/button";
import KeyDialog from "../components/KeyDialog.vue";
import KeyStatus from "../components/KeyStatus.vue";
import { apiKeysKey, grantsLabel, keyStatus } from "../api-keys";

const { t, locale } = useI18n();
const route = useRoute();
useHead({ title: () => t("nav.apiKeys") });

const keys = shallowRef<ApiKey[]>([]);
const loading = ref(true);

async function load() {
  keys.value = await client.apiKeys.list();
}
onMounted(() =>
  load()
    .catch((e: Error) => toast.error(e.message))
    .finally(() => (loading.value = false)),
);

const created = ref<NewApiKey>();
const secretOpen = ref(false);
function showKey(key: NewApiKey) {
  created.value = key;
  secretOpen.value = true;
}
provide(apiKeysKey, { keys, loading, load, showKey });

const to = (key: ApiKey) => `/api-keys/${key.id}`;
function expiry(key: ApiKey) {
  if (!key.expiresAt) return t("apiKeys.noExpiry");
  const at = new Date(key.expiresAt);
  const date = at.toLocaleDateString(locale.value);
  return t(at.getTime() < Date.now() ? "apiKeys.expired" : "apiKeys.expiresOn", { date });
}
const subtitle = (key: ApiKey) => `${grantsLabel(key.permissions)} · ${expiry(key)}`;
</script>

<template>
  <Pane :title="t('nav.apiKeys')">
    <template #actions>
      <Button as-child variant="ghost" size="icon-sm" :aria-label="t('apiKeys.new')">
        <RouterLink to="/api-keys/new"><Icon name="plus" /></RouterLink>
      </Button>
    </template>
    <PaneMenu layout="detailed">
      <PaneMenuSkeleton v-if="loading" />
      <template v-else>
        <PaneMenuItem
          v-for="key in keys"
          :key="key.id"
          :to="to(key)"
          icon="key-round"
          :label="key.name ?? `${key.start}…`"
          :subtitle="subtitle(key)"
          :active="route.path === to(key)"
        >
          <template #end><KeyStatus :status="keyStatus(key)" compact /></template>
        </PaneMenuItem>
        <p v-if="!keys.length" class="text-muted-foreground px-2 py-2 text-sm">
          {{ t("apiKeys.empty") }}
        </p>
      </template>
    </PaneMenu>
  </Pane>
  <RouterView v-slot="{ Component }">
    <component :is="Component" v-if="Component" :key="route.path" />
    <div
      v-else
      class="text-muted-foreground hidden flex-1 items-center justify-center text-sm sm:flex"
    >
      {{ t("apiKeys.select") }}
    </div>
  </RouterView>
  <KeyDialog
    v-if="created"
    v-model:open="secretOpen"
    :name="created.name ?? ''"
    :secret="created.key"
  />
</template>
