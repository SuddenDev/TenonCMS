<script setup lang="ts">
import { nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldSeparator } from "@/shared/components/ui/field";
import { setPassword } from "../account";
import { addPasskey, cancelled } from "../passkey";
import AuthCard from "./AuthCard.vue";
import PasswordInput from "./PasswordInput.vue";

const {
  passkey = false,
  password = false,
  email = false,
} = defineProps<{
  /** Offers to create a passkey. */
  passkey?: boolean;
  /** Offers to set a password. */
  password?: boolean;
  /** An emailed code or link signs the user in, so they MAY skip. */
  email?: boolean;
}>();
const emit = defineEmits<{ done: [] }>();
const { t } = useI18n();
// Shows the password field. Without a passkey to offer, the password is the first choice.
const choosingPassword = ref(password && !passkey);
const newPassword = ref("");
const error = ref("");
const busy = ref(false);

// A new account's session is fresh, as better-auth requires for adding a passkey.
async function run(action: () => Promise<unknown>) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await action();
    emit("done");
  } catch (e) {
    if (!cancelled(e)) error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

const createPasskey = () => run(addPasskey);

async function choosePassword() {
  choosingPassword.value = true;
  await nextTick();
  document.getElementById("new-password")?.focus();
}

function submit() {
  if (choosingPassword.value) void run(() => setPassword(newPassword.value));
  else void createPasskey();
}
</script>

<template>
  <AuthCard
    :title="t('auth.signInStep.title')"
    :description="t('auth.signInStep.description')"
    :heading="true"
  >
    <form :aria-busy="busy" @submit.prevent="submit">
      <FieldGroup>
        <Field v-if="choosingPassword">
          <FieldLabel for="new-password">{{ t("auth.password") }}</FieldLabel>
          <PasswordInput
            id="new-password"
            v-model="newPassword"
            variant="register"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </Field>
        <p v-if="error" role="alert" class="text-destructive text-sm">{{ error }}</p>
        <Field>
          <Button type="submit" size="lg" :disabled="busy">
            <template v-if="choosingPassword">{{ t("auth.signInStep.setPassword") }}</template>
            <template v-else><Icon name="key-round" />{{ t("auth.signInStep.passkey") }}</template>
          </Button>
          <template v-if="(passkey && password) || email">
            <FieldSeparator class="*:data-[slot=field-separator-content]:bg-card my-2">
              {{ t("auth.or") }}
            </FieldSeparator>
            <Button
              v-if="passkey && password"
              type="button"
              variant="outline"
              size="lg"
              :disabled="busy"
              @click="choosingPassword ? createPasskey() : choosePassword()"
            >
              <template v-if="choosingPassword">
                <Icon name="key-round" />{{ t("auth.signInStep.passkey") }}
              </template>
              <template v-else><Icon name="lock" />{{ t("auth.signInStep.password") }}</template>
            </Button>
            <Button
              v-if="email"
              type="button"
              variant="ghost"
              :disabled="busy"
              @click="emit('done')"
            >
              {{ t("auth.signInStep.email") }}
            </Button>
          </template>
        </Field>
      </FieldGroup>
    </form>
  </AuthCard>
</template>
