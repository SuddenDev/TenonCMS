<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, inject, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { client } from "@/shared/api";
import { sessionKey } from "@/shared/options";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { useAuthStatus } from "../composables/useAuthStatus";
import { cancelled, passkeysSupported, signInWithPasskey } from "../passkey";
import AuthCard from "./AuthCard.vue";
import PasswordInput from "./PasswordInput.vue";
import { Separator } from "@/shared/components/ui/separator";

const { load } = inject(sessionKey)!;
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const status = useAuthStatus();
const form = ref({ email: "", password: "" });
const error = ref("");
const busy = ref(false);
const passkeys = computed(() => !!status.value?.passkeys && passkeysSupported());

useHead({ title: () => t("auth.signIn") });

watch(status, (s) => {
  if (s?.setup) void router.replace({ path: "/signup", query: route.query });
});

// The session reload sends the admin on (App.vue).
async function run(signIn: () => Promise<unknown>) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await signIn();
    await load();
  } catch (e) {
    if (!cancelled(e)) error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

const submit = () => run(() => client.signIn(form.value));

// One passkey request at a time: each one replaces the server's challenge cookie.
let autofill: { abort: AbortController; done: Promise<void> } | undefined;
let unmounted = false;
watch(passkeys, async (on) => {
  if (!on || !(await PublicKeyCredential.isConditionalMediationAvailable?.()) || unmounted) return;
  const abort = new AbortController();
  const done = signInWithPasskey({ conditional: true, signal: abort.signal }).then(load, (e) => {
    if (!cancelled(e)) error.value = (e as Error).message;
  });
  autofill = { abort, done };
});
onUnmounted(() => {
  unmounted = true;
  autofill?.abort.abort();
});

async function withPasskey() {
  autofill?.abort.abort();
  await autofill?.done;
  autofill = undefined;
  await run(() => signInWithPasskey());
}
</script>

<template>
  <AuthCard :title="t('auth.signIn')">
    <form :aria-busy="busy" @submit.prevent="submit">
      <FieldGroup>
        <Field>
          <FieldLabel for="email">{{ t("auth.email") }}</FieldLabel>
          <Input
            id="email"
            v-model="form.email"
            type="email"
            autocomplete="username webauthn"
            placeholder="email@example.com"
            required
          />
        </Field>
        <Field>
          <div class="flex items-center">
            <FieldLabel for="password">{{ t("auth.password") }}</FieldLabel>
            <RouterLink
              to="/forgot-password"
              class="text-muted-foreground hover:text-foreground ml-auto text-sm underline-offset-4 hover:underline"
            >
              {{ t("auth.forgotPassword") }}
            </RouterLink>
          </div>
          <PasswordInput
            id="password"
            v-model="form.password"
            autocomplete="current-password"
            required
          />
        </Field>
        <p v-if="error" role="alert" class="text-destructive text-sm">{{ error }}</p>
        <Field>
          <Button type="submit" size="lg" :disabled="busy">{{ t("auth.signIn") }}</Button>
          <template v-if="passkeys">
            <Separator class="my-2" />
            <Button type="button" variant="outline" size="lg" :disabled="busy" @click="withPasskey">
              <Icon name="key-round" />{{ t("auth.signInWithPasskey") }}
            </Button>
          </template>
          <FieldDescription v-if="status?.signUp" class="text-center">
            {{ t("auth.noAccount") }}
            <RouterLink :to="{ path: '/signup', query: route.query }">{{
              t("auth.signUp")
            }}</RouterLink>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  </AuthCard>
</template>
