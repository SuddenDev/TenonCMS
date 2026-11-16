import { onMounted, ref } from "vue";
import { client } from "@/shared/api";

export type AuthStatus = {
  setup: boolean;
  signUp: boolean;
  password: boolean;
  passkeys: boolean;
  /** On only when the server can send the email. */
  magicLink: boolean;
  /** On only when the server can send the email. */
  emailOtp: boolean;
  /** How many digits an email code has. */
  emailOtpLength: number;
};

/**
 * Whether the first admin is missing, whether a visitor MAY sign up, and which sign-in methods the server offers. A
 * failed request counts as closed, with password sign-in.
 */
export const loadAuthStatus = () =>
  client.request<AuthStatus>("/auth-status").catch(() => ({
    setup: false,
    signUp: false,
    password: true,
    passkeys: false,
    magicLink: false,
    emailOtp: false,
    emailOtpLength: 6,
  }));

/** {@link loadAuthStatus}, asked on every mount, because the first sign-up ends the setup. */
export function useAuthStatus() {
  const status = ref<AuthStatus>();
  onMounted(async () => {
    status.value = await loadAuthStatus();
  });
  return status;
}
