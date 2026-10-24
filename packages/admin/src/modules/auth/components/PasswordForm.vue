<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Button } from "@/shared/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { changePassword, hasPassword, setPassword } from "../account";
import PasswordInput from "./PasswordInput.vue";

const { t } = useI18n();
// `undefined` while loading.
const existing = ref<boolean>();
const current = ref("");
const next = ref("");
const error = ref("");
const busy = ref(false);

onMounted(async () => {
  existing.value = await hasPassword().catch(() => true);
});

async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    if (existing.value) await changePassword(current.value, next.value);
    else await setPassword(next.value);
    toast.success(t(existing.value ? "account.passwordChanged" : "account.passwordSet"));
    existing.value = true;
    current.value = next.value = "";
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form v-if="existing !== undefined" :aria-busy="busy" @submit.prevent="submit">
    <FieldGroup class="gap-4">
      <FieldDescription>
        {{ t(existing ? "account.changePasswordHint" : "account.noPassword") }}
      </FieldDescription>
      <Field v-if="existing">
        <FieldLabel for="current-password">{{ t("account.currentPassword") }}</FieldLabel>
        <PasswordInput
          id="current-password"
          v-model="current"
          autocomplete="current-password"
          required
        />
      </Field>
      <Field>
        <FieldLabel for="new-password">{{ t("auth.newPassword") }}</FieldLabel>
        <PasswordInput
          id="new-password"
          v-model="next"
          variant="register"
          autocomplete="new-password"
          minlength="8"
          required
        />
      </Field>
      <p v-if="error" role="alert" class="text-destructive text-sm">{{ error }}</p>
      <Button type="submit" class="justify-self-start" size="lg" :disabled="busy">
        {{ t(existing ? "account.changePassword" : "account.setPassword") }}
      </Button>
    </FieldGroup>
  </form>
</template>
