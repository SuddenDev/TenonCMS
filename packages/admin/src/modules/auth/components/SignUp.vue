<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, inject, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { client } from "@/shared/api";
import { sessionKey } from "@/shared/options";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { useAuthStatus } from "../composables/useAuthStatus";
import { passkeysSupported } from "../passkey";
import AuthCard from "./AuthCard.vue";
import PasswordInput from "./PasswordInput.vue";
import SignInStep from "./SignInStep.vue";

const { load } = inject(sessionKey)!;
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const status = useAuthStatus();
const setup = computed(() => !!status.value?.setup);
const title = computed(() => t(setup.value ? "auth.createFirstAdmin" : "auth.signUp"));
const form = ref({ name: "", email: "", password: "" });
const error = ref("");
const busy = ref(false);
const passkeyStep = ref(false);

useHead({ title });

watch(status, (s) => {
  if (s && !s.signUp) void router.replace({ path: "/login", query: route.query });
});

// The session reload sends the new user on (App.vue), so the passkey step comes before it.
async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const withPassword = status.value!.password;
    const { name, email } = form.value;
    if (withPassword) await client.signUp(form.value);
    else await client.setup({ name, email });
    // Without a password, a passkey is how the user signs in next time.
    if (!withPassword && status.value!.passkeys && passkeysSupported()) passkeyStep.value = true;
    else await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <SignInStep
    v-if="passkeyStep"
    passkey
    :email="status?.magicLink || status?.emailOtp"
    @done="load"
  />
  <AuthCard
    v-else-if="status?.signUp"
    :title="title"
    :description="setup ? t('auth.firstAdminDescription') : undefined"
    :heading="setup"
  >
    <form :aria-busy="busy" @submit.prevent="submit">
      <FieldGroup>
        <Field>
          <FieldLabel for="name">{{ t("auth.name") }}</FieldLabel>
          <Input
            id="name"
            v-model="form.name"
            autocomplete="name"
            :placeholder="t('auth.namePlaceholder')"
            required
          />
        </Field>
        <Field>
          <FieldLabel for="email">{{ t("auth.email") }}</FieldLabel>
          <Input
            id="email"
            v-model="form.email"
            type="email"
            autocomplete="email"
            placeholder="email@example.com"
            required
          />
        </Field>
        <Field v-if="status.password">
          <FieldLabel for="password">{{ t("auth.password") }}</FieldLabel>
          <PasswordInput
            id="password"
            v-model="form.password"
            variant="register"
            autocomplete="new-password"
            minlength="8"
            required
          />
        </Field>
        <p v-if="error" role="alert" class="text-destructive text-sm">{{ error }}</p>
        <Field>
          <Button type="submit" :disabled="busy">
            {{ t(setup ? "auth.createAdmin" : "auth.createAccount") }}
          </Button>
          <FieldDescription v-if="!setup" class="text-center">
            {{ t("auth.haveAccount") }}
            <RouterLink :to="{ path: '/login', query: route.query }">{{
              t("auth.signIn")
            }}</RouterLink>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  </AuthCard>
</template>
