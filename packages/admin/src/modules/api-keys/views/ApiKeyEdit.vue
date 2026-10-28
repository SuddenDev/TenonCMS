<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { client } from "@/shared/api";
import ConfirmDialog from "@/modules/users/components/ConfirmDialog.vue";
import UserPane from "@/modules/users/components/UserPane.vue";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import KeyStatus from "../components/KeyStatus.vue";
import PermissionGrid from "../components/PermissionGrid.vue";
import { apiKeysKey, gridGroups, keyStatus } from "../api-keys";

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const ctx = inject(apiKeysKey)!;

const key = computed(() => ctx.keys.value.find((k) => k.id === String(route.params.id)));
const label = computed(() => key.value?.name ?? `${key.value?.start}…`);
const groups = gridGroups();
const date = (iso: string | null, empty: string) =>
  iso ? new Date(iso).toLocaleDateString(locale.value) : empty;

const rollOpen = ref(false);
const revokeOpen = ref(false);
const deleteOpen = ref(false);
async function run(action: "roll" | "revoke" | "delete") {
  try {
    const rolled = await client.apiKeys[action](key.value!.id);
    if (rolled) ctx.showKey(rolled);
  } catch (e) {
    return toast.error((e as Error).message);
  }
  await ctx.load().catch(() => {});
  if (action === "delete") await router.push("/api-keys");
}
</script>

<template>
  <UserPane v-if="key" :title="label" :kind="t('apiKeys.key')" back="/api-keys" wide>
    <Card>
      <CardContent>
        <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt class="text-muted-foreground">{{ t("apiKeys.status") }}</dt>
          <dd><KeyStatus :status="keyStatus(key)" /></dd>
          <dt class="text-muted-foreground">{{ t("apiKeys.creator") }}</dt>
          <dd>
            {{
              key.creator ? `${key.creator.name} · ${key.creator.email}` : t("apiKeys.noCreator")
            }}
          </dd>
          <dt class="text-muted-foreground">{{ t("apiKeys.start") }}</dt>
          <dd class="font-mono">{{ key.start }}…</dd>
          <dt class="text-muted-foreground">{{ t("apiKeys.created") }}</dt>
          <dd>{{ date(key.createdAt, "") }}</dd>
          <dt class="text-muted-foreground">{{ t("apiKeys.lastUsed") }}</dt>
          <dd>{{ date(key.lastUsedAt, t("apiKeys.neverUsed")) }}</dd>
          <dt class="text-muted-foreground">{{ t("apiKeys.expires") }}</dt>
          <dd>{{ date(key.expiresAt, t("apiKeys.never")) }}</dd>
        </dl>
      </CardContent>
    </Card>
    <PermissionGrid :model-value="key.permissions" :groups="groups" readonly />
    <div class="flex flex-wrap gap-2">
      <Button v-if="key.enabled" variant="outline" @click="rollOpen = true">
        {{ t("apiKeys.roll") }}
      </Button>
      <Button v-if="key.enabled" variant="destructive" @click="revokeOpen = true">
        {{ t("apiKeys.revoke") }}
      </Button>
      <Button variant="outline" @click="deleteOpen = true">{{ t("apiKeys.delete") }}</Button>
    </div>
    <ConfirmDialog
      v-model:open="rollOpen"
      :title="t('apiKeys.confirmRoll.title', { name: label })"
      :text="t('apiKeys.confirmRoll.text')"
      :action="t('apiKeys.roll')"
      @confirm="run('roll')"
    />
    <ConfirmDialog
      v-model:open="revokeOpen"
      :title="t('apiKeys.confirmRevoke.title', { name: label })"
      :text="t('apiKeys.confirmRevoke.text')"
      :action="t('apiKeys.revoke')"
      destructive
      @confirm="run('revoke')"
    />
    <ConfirmDialog
      v-model:open="deleteOpen"
      :title="t('apiKeys.confirmDelete.title', { name: label })"
      :text="t('apiKeys.confirmDelete.text')"
      :action="t('apiKeys.delete')"
      destructive
      @confirm="run('delete')"
    />
  </UserPane>
  <p v-else-if="!ctx.loading.value" class="text-muted-foreground flex-1 p-6 text-sm">
    {{ t("apiKeys.notFound") }}
  </p>
</template>
