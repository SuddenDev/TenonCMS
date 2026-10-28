<script setup lang="ts">
import { inject, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import type { ApiKeyPermissions } from "../../../../../core/src/client";
import { client } from "@/shared/api";
import UserPane from "@/modules/users/components/UserPane.vue";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { Input } from "@/shared/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/shared/components/ui/native-select";
import PermissionGrid from "../components/PermissionGrid.vue";
import { EXPIRY_DAYS, apiKeysKey, gridGroups } from "../api-keys";

const { t } = useI18n();
const router = useRouter();
const ctx = inject(apiKeysKey)!;

const groups = gridGroups();
const name = ref("");
const permissions = ref<ApiKeyPermissions>({});
const days = ref<(typeof EXPIRY_DAYS)[number]>(90);
const error = ref("");
const busy = ref(false);

async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const key = await client.apiKeys.create({
      name: name.value,
      permissions: permissions.value,
      ...(days.value && { expiresIn: days.value * 86_400 }),
    });
    await ctx.load();
    await router.push(`/api-keys/${key.id}`);
    ctx.showKey(key);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <UserPane :title="t('apiKeys.new')" :kind="t('apiKeys.key')" back="/api-keys" wide>
    <Card>
      <CardContent>
        <form :aria-busy="busy" @submit.prevent="submit">
          <FieldGroup class="gap-6">
            <fieldset :disabled="busy" class="contents">
              <div class="grid gap-6 sm:grid-cols-2">
                <Field>
                  <FieldLabel for="new-key-name">{{ t("apiKeys.name") }}</FieldLabel>
                  <Input
                    id="new-key-name"
                    v-model="name"
                    autocomplete="off"
                    maxlength="32"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel for="new-key-expiry">{{ t("apiKeys.expires") }}</FieldLabel>
                  <NativeSelect id="new-key-expiry" v-model.number="days" class="w-full">
                    <NativeSelectOption v-for="d in EXPIRY_DAYS" :key="d" :value="d">
                      {{ d ? t("apiKeys.days", { n: d }) : t("apiKeys.never") }}
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
              </div>
              <Field>
                <FieldLabel>{{ t("apiKeys.access") }}</FieldLabel>
                <PermissionGrid v-model="permissions" :groups="groups" />
                <FieldDescription>{{ t("apiKeys.limits") }}</FieldDescription>
              </Field>
            </fieldset>
            <p v-if="error" role="alert" class="text-destructive text-sm">{{ error }}</p>
            <Button type="submit" class="justify-self-start" :disabled="busy">
              {{ t("apiKeys.create") }}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  </UserPane>
</template>
