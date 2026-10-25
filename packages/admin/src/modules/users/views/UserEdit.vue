<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { schema } from "@/shared/api";
import { sessionKey } from "@/shared/options";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import RoleSelect from "../components/RoleSelect.vue";
import UserPane from "../components/UserPane.vue";
import UserStatus from "../components/UserStatus.vue";
import { rows } from "../status";
import * as api from "../users";

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const session = inject(sessionKey)!;
const ctx = inject(api.usersKey)!;

const row = computed(() => rows(ctx.users.value, []).find((r) => r.id === String(route.params.id)));
const name = computed(() => row.value?.name || row.value?.email || "");
const isMe = computed(() => row.value?.id === session.user.value?.id);

/** Runs an action, shows its message, then reloads the list. */
async function run(action: () => Promise<unknown>, success?: string) {
  try {
    await action();
    if (success) toast.success(success);
  } catch (e) {
    toast.error((e as Error).message);
  }
  await ctx.load().catch(() => {});
}

const setRole = (role: string) =>
  run(
    () => api.setRole(row.value!.id, role),
    t("users.roleChanged", { name: name.value, role: api.roleLabel(role) }),
  );

const confirming = ref<"deactivate" | "remove">();
const confirmOpen = ref(false);
function ask(kind: "deactivate" | "remove") {
  confirming.value = kind;
  confirmOpen.value = true;
}
async function confirm() {
  const id = row.value!.id;
  if (confirming.value === "deactivate") return run(() => api.deactivate(id));
  await run(() => api.removeUser(id));
  await router.push("/users");
}
</script>

<template>
  <UserPane v-if="row" :title="name" :kind="t('users.user')" :subtitle="row.name ? row.email : ''">
    <Card>
      <CardContent>
        <FieldGroup class="gap-6">
          <Field>
            <FieldLabel for="user-role">{{ t("users.role") }}</FieldLabel>
            <RoleSelect id="user-role" :model-value="row.role" @update:model-value="setRole" />
          </Field>
          <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt class="text-muted-foreground">{{ t("users.status") }}</dt>
            <dd><UserStatus :status="row.status" /></dd>
            <dt class="text-muted-foreground">{{ t("users.date") }}</dt>
            <dd>{{ new Date(row.date).toLocaleDateString(locale) }}</dd>
          </dl>
        </FieldGroup>
      </CardContent>
    </Card>
    <div class="flex flex-wrap gap-2">
      <Button
        v-if="schema.email"
        variant="outline"
        @click="
          run(
            () => api.sendPasswordReset(row!.email, api.adminUrl(router, '/reset-password')),
            t('users.resetSent', { email: row!.email }),
          )
        "
      >
        {{ t("users.sendReset") }}
      </Button>
      <Button
        variant="outline"
        @click="run(() => api.signOutEverywhere(row!.id), t('users.signedOut', { name: name }))"
      >
        {{ t("users.signOutEverywhere") }}
      </Button>
      <template v-if="!isMe">
        <Button
          v-if="row.status === 'deactivated'"
          variant="outline"
          @click="run(() => api.reactivate(row!.id))"
        >
          {{ t("users.reactivate") }}
        </Button>
        <Button v-else variant="outline" @click="ask('deactivate')">
          {{ t("users.deactivate") }}
        </Button>
        <Button variant="destructive" @click="ask('remove')">{{ t("users.remove") }}</Button>
      </template>
    </div>
    <ConfirmDialog
      v-if="confirming"
      v-model:open="confirmOpen"
      :title="t(`users.confirm.${confirming}.title`, { name })"
      :text="t(`users.confirm.${confirming}.text`)"
      :action="t(`users.${confirming}`)"
      :destructive="confirming === 'remove'"
      @confirm="confirm"
    />
  </UserPane>
  <p v-else-if="!ctx.loading.value" class="text-muted-foreground flex-1 p-6 text-sm">
    {{ t("users.notFound") }}
  </p>
</template>
