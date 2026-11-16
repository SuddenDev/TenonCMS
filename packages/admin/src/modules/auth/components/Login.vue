<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { computed, inject, nextTick, onUnmounted, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { client, CmsError } from "@/shared/api";
import { sessionKey } from "@/shared/options";
import Icon from "@/shared/components/Icon.vue";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/shared/components/ui/field";
import { PinInput, PinInputSlot } from "@/shared/components/ui/pin-input";
import { adminUrl } from "@/modules/users/users";
import { useAuthStatus } from "../composables/useAuthStatus";
import { cancelled, passkeysSupported, signInWithPasskey } from "../passkey";
import AuthCard from "./AuthCard.vue";
import PasswordInput from "./PasswordInput.vue";

type EmailMethod = "emailOtp" | "magicLink";

const labels = { emailOtp: "auth.emailCode.send", magicLink: "auth.emailLink.send" } as const;
const icons = { emailOtp: "rectangle-ellipsis", magicLink: "mail" } as const;
// The values of better-auth's `last-login-method` cookie, which core sets on sign-in.
const remembered = {
  email: "password",
  "email-otp": "emailOtp",
  "magic-link": "magicLink",
} as const;
const errors: Record<string, string> = {
  INVALID_OTP: "auth.emailCode.invalid",
  OTP_EXPIRED: "auth.emailCode.expired",
  TOO_MANY_ATTEMPTS: "auth.emailCode.tooManyAttempts",
};

const { load } = inject(sessionKey)!;
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const status = useAuthStatus();
const formEl = useTemplateRef<HTMLFormElement>("form");
const form = ref({ email: "", password: "" });
const code = ref<string[]>([]);
// `undefined` asks for the email, `choose` offers every method, `password` only the remembered one, an email method
// waits for its email.
const step = ref<"choose" | "password" | EmailMethod>();
const error = ref("");
const busy = ref(false);
const passkeys = computed(() => !!status.value?.passkeys && passkeysSupported());
const emailMethods = computed(() =>
  (["emailOtp", "magicLink"] as const).filter((m) => status.value?.[m]),
);
// One email method alone needs no choice: "Continue" sends it.
const hasChoice = computed(() => !!status.value?.password || emailMethods.value.length > 1);
// Password alone shows email and password on one screen.
const askPassword = computed(
  () =>
    !!status.value?.password &&
    (step.value === "choose" || step.value === "password" || !emailMethods.value.length),
);
const sent = computed(() => step.value === "emailOtp" || step.value === "magicLink");
// These steps offer one method, with a way back to the others.
const single = computed(() => sent.value || step.value === "password");
// The email methods the second step offers as buttons.
const others = computed(() => (step.value === "choose" ? emailMethods.value : []));
const submitLabel = computed(() => {
  if (step.value === "emailOtp" || askPassword.value) return t("auth.signIn");
  return step.value ? undefined : t("auth.continue");
});

useHead({ title: () => t("auth.signIn") });

watch(status, (s) => {
  if (s?.setup) void router.replace({ path: "/signup", query: route.query });
});

// A magic link or recovery link that failed comes back with `?error=`.
if (typeof route.query.error === "string") {
  error.value = t(
    route.query.error === "INVALID_TOKEN" ? "auth.emailLink.invalid" : "auth.emailLink.failed",
  );
  void router.replace({ query: { ...route.query, error: undefined } });
}

async function run(action: () => Promise<unknown>) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await action();
  } catch (e) {
    if (cancelled(e)) return;
    const key = e instanceof CmsError ? errors[e.body?.code as string] : undefined;
    error.value = key ? t(key) : (e as Error).message;
  } finally {
    busy.value = false;
  }
}

// The session reload sends the admin on (App.vue).
const signIn = (method: () => Promise<unknown>) =>
  run(async () => {
    await method();
    await load();
  });

async function focus(selector: string) {
  await nextTick();
  formEl.value?.querySelector<HTMLElement>(selector)?.focus();
}

function submit() {
  if (step.value === "emailOtp") void signInWithCode();
  else if (askPassword.value) void signIn(() => client.signIn(form.value));
  else if (!step.value && hasChoice.value) next();
  else if (emailMethods.value[0]) void sendEmail(emailMethods.value[0]);
}

// Continues with the method this device signed in with last, or offers every method.
function next() {
  const cookie = document.cookie.match(/(?:^|; )better-auth\.last_used_login_method=([^;]*)/);
  const last = remembered[cookie?.[1] as keyof typeof remembered];
  if (!last || !status.value?.[last]) step.value = "choose";
  else if (last !== "password") return void sendEmail(last);
  else step.value = last;
  void focus("#password");
}

// The buttons skip the form's validation, which would ask for the password.
function sendFromButton(method: EmailMethod) {
  const email = formEl.value?.elements.namedItem("email") as HTMLInputElement | null;
  if (email?.reportValidity()) void sendEmail(method);
}

// The link lands on this page, signed in or with `?error=`, and App.vue then follows `redirect`.
const sendEmail = (method: EmailMethod) =>
  run(async () => {
    const { email } = form.value;
    if (method === "magicLink") {
      const here = adminUrl(router, route.fullPath);
      await client.signInMagicLink({ email, callbackURL: here, errorCallbackURL: here });
    } else {
      await client.sendSignInCode({ email });
      if (step.value === "emailOtp") toast.success(t("auth.emailCode.resent"));
    }
    code.value = [];
    step.value = method;
    void focus("input");
  });

async function signInWithCode() {
  await signIn(() => client.signInWithCode({ email: form.value.email, otp: code.value.join("") }));
  if (!error.value) return;
  code.value = [];
  void focus("input");
}

function back() {
  step.value = hasChoice.value ? "choose" : undefined;
  code.value = [];
  error.value = "";
  void focus(askPassword.value ? "#password" : "#email");
}

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
  await signIn(() => signInWithPasskey());
}
</script>

<template>
  <AuthCard
    :title="
      t(
        step === 'emailOtp'
          ? 'auth.emailCode.title'
          : step === 'magicLink'
            ? 'auth.emailLink.checkInbox'
            : 'auth.signIn',
      )
    "
    :description="step === 'emailOtp' ? t('auth.emailCode.sent', { email: form.email }) : undefined"
    :heading="sent"
  >
    <form v-if="status" ref="form" :aria-busy="busy" @submit.prevent="submit">
      <FieldGroup>
        <Field v-if="!sent">
          <FieldLabel for="email">{{ t("auth.email") }}</FieldLabel>
          <Input
            id="email"
            v-model="form.email"
            type="email"
            name="email"
            autocomplete="username webauthn"
            placeholder="email@example.com"
            required
          />
        </Field>

        <Field v-if="askPassword">
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

        <Field v-if="step === 'emailOtp'">
          <PinInput v-model="code" otp type="text" :disabled="busy" @complete="signInWithCode">
            <PinInputSlot
              v-for="i in status.emailOtpLength"
              :key="i"
              :index="i - 1"
              :aria-label="t('auth.emailCode.digit', { n: i, total: status.emailOtpLength })"
            />
          </PinInput>
        </Field>

        <p v-if="step === 'magicLink'" role="status" class="text-muted-foreground text-sm">
          {{ t("auth.emailLink.sent", { email: form.email }) }}
        </p>

        <p v-if="error" role="alert" class="text-destructive text-sm">{{ error }}</p>

        <Field>
          <Button v-if="submitLabel" type="submit" size="lg" :disabled="busy">
            {{ submitLabel }}
          </Button>

          <template v-if="single">
            <Button
              v-if="step === 'emailOtp'"
              type="button"
              variant="ghost"
              size="sm"
              class="text-muted-foreground"
              :disabled="busy"
              @click="sendEmail('emailOtp')"
            >
              {{ t("auth.emailCode.resend") }}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="text-muted-foreground"
              @click="back"
            >
              <Icon name="arrow-left" />{{ t(hasChoice ? "auth.otherMethod" : "common.back") }}
            </Button>
          </template>

          <template v-else>
            <FieldSeparator
              v-if="submitLabel && (others.length || passkeys)"
              class="*:data-[slot=field-separator-content]:bg-card my-2"
            >
              {{ t("auth.or") }}
            </FieldSeparator>
            <Button
              v-for="(method, i) in others"
              :key="method"
              type="button"
              :variant="submitLabel || i > 0 ? 'outline' : 'default'"
              size="lg"
              :disabled="busy"
              @click="sendFromButton(method)"
            >
              <Icon :name="icons[method]" />{{ t(labels[method]) }}
            </Button>
            <Button
              v-if="passkeys"
              type="button"
              variant="outline"
              size="lg"
              :disabled="busy"
              @click="withPasskey"
            >
              <Icon name="key-round" />{{ t("auth.signInWithPasskey") }}
            </Button>
            <FieldDescription v-if="status.signUp" class="text-center">
              {{ t("auth.noAccount") }}
              <RouterLink :to="{ path: '/signup', query: route.query }">{{
                t("auth.signUp")
              }}</RouterLink>
            </FieldDescription>
          </template>
        </Field>
      </FieldGroup>
    </form>
  </AuthCard>
</template>
